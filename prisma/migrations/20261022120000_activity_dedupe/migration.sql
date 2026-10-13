-- 1. Idempotent logging: the same entry (same lead/agent/type/text) arriving again within 2 seconds is a
--    double click or a repeated request, not a second action, so the database ignores it.
CREATE OR REPLACE FUNCTION skip_duplicate_lead_entry() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "LeadActivity" x
    WHERE x."leadId" = NEW."leadId" AND x."userId" IS NOT DISTINCT FROM NEW."userId" AND x."type" = NEW."type"
      AND x."text" IS NOT DISTINCT FROM NEW."text" AND x."createdAt" > NEW."createdAt" - interval '2 seconds'
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "trg_dedupe_lead_entry" ON "LeadActivity";
CREATE TRIGGER "trg_dedupe_lead_entry" BEFORE INSERT ON "LeadActivity" FOR EACH ROW EXECUTE FUNCTION skip_duplicate_lead_entry();

CREATE OR REPLACE FUNCTION skip_duplicate_activity() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Activity" x
    WHERE x."organizationId" = NEW."organizationId" AND x."type" = NEW."type" AND x."agentId" IS NOT DISTINCT FROM NEW."agentId"
      AND x."leadId" IS NOT DISTINCT FROM NEW."leadId" AND x."listingId" IS NOT DISTINCT FROM NEW."listingId"
      AND x."note" IS NOT DISTINCT FROM NEW."note" AND x."newValue" IS NOT DISTINCT FROM NEW."newValue"
      AND x."createdAt" > NEW."createdAt" - interval '2 seconds'
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "trg_dedupe_activity" ON "Activity";
CREATE TRIGGER "trg_dedupe_activity" BEFORE INSERT ON "Activity" FOR EACH ROW EXECUTE FUNCTION skip_duplicate_activity();

-- 2. A viewing activity carries the viewing's own property (from the entry's data), not just the lead's.
CREATE OR REPLACE FUNCTION activity_from_lead_entry() RETURNS trigger AS $$
DECLARE t TEXT; src TEXT; lid INTEGER; o TEXT; n TEXT; vid INTEGER;
BEGIN
  t := activity_type_for_lead_entry(NEW."type");
  IF t IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(l."sourceLabel", CASE l."source"::text WHEN 'PROPERTY_FINDER' THEN 'Property Finder' WHEN 'META' THEN 'Facebook / Instagram' WHEN 'MANUAL' THEN 'Manual' ELSE 'Import' END), l."listingId"
    INTO src, lid FROM "Lead" l WHERE l."id" = NEW."leadId";
  IF t LIKE 'viewing_%' AND jsonb_typeof(NEW."data") = 'object' AND (NEW."data" ->> 'listingId') ~ '^[0-9]+$' THEN
    vid := (NEW."data" ->> 'listingId')::int;
    lid := vid;
  END IF;
  IF t = 'stage_changed' AND NEW."text" LIKE 'Stage: % → %' THEN
    o := split_part(substr(NEW."text", 8), ' → ', 1);
    n := split_part(substr(NEW."text", 8), ' → ', 2);
  END IF;
  INSERT INTO "Activity" ("id", "organizationId", "type", "agentId", "leadId", "listingId", "oldValue", "newValue", "note", "source", "createdAt")
  VALUES (gen_random_uuid()::text, NEW."organizationId", t, NEW."userId", NEW."leadId", lid, o, n, NEW."text", src, NEW."createdAt");
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- 3. Remove the duplicates already in the data (same entry within 5 seconds: keep the first).
DELETE FROM "LeadActivity" a USING "LeadActivity" b
WHERE a."id" <> b."id" AND a."leadId" = b."leadId" AND a."userId" IS NOT DISTINCT FROM b."userId" AND a."type" = b."type"
  AND a."text" IS NOT DISTINCT FROM b."text" AND a."createdAt" > b."createdAt" AND a."createdAt" - b."createdAt" <= interval '5 seconds';

DELETE FROM "Activity" a USING "Activity" b
WHERE a."id" <> b."id" AND a."organizationId" = b."organizationId" AND a."type" = b."type" AND a."agentId" IS NOT DISTINCT FROM b."agentId"
  AND a."leadId" IS NOT DISTINCT FROM b."leadId" AND a."listingId" IS NOT DISTINCT FROM b."listingId"
  AND a."note" IS NOT DISTINCT FROM b."note" AND a."newValue" IS NOT DISTINCT FROM b."newValue"
  AND a."createdAt" > b."createdAt" AND a."createdAt" - b."createdAt" <= interval '5 seconds';

DELETE FROM "LeadTask" a USING "LeadTask" b
WHERE a."id" <> b."id" AND a."leadId" = b."leadId" AND a."text" = b."text" AND a."dueAt" = b."dueAt" AND a."createdById" IS NOT DISTINCT FROM b."createdById"
  AND a."createdAt" > b."createdAt" AND a."createdAt" - b."createdAt" <= interval '5 seconds';

-- 4. Existing viewing activities get their viewing's property.
UPDATE "Activity" a SET "listingId" = v."listingId"
FROM "LeadActivity" la JOIN "Viewing" v ON v."id" = (la."data" ->> 'viewingId')
WHERE la."leadId" = a."leadId" AND la."createdAt" = a."createdAt" AND a."type" LIKE 'viewing_%' AND v."listingId" IS NOT NULL;

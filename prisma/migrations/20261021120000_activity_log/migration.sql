CREATE TABLE IF NOT EXISTS "Activity" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "agentId" TEXT,
  "leadId" TEXT,
  "listingId" INTEGER,
  "oldValue" TEXT,
  "newValue" TEXT,
  "note" TEXT,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Activity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Activity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Activity_createdAt_idx" ON "Activity"("createdAt");
CREATE INDEX IF NOT EXISTS "Activity_agentId_createdAt_idx" ON "Activity"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "Activity_type_createdAt_idx" ON "Activity"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "Activity_leadId_idx" ON "Activity"("leadId");
CREATE INDEX IF NOT EXISTS "Activity_listingId_idx" ON "Activity"("listingId");
CREATE INDEX IF NOT EXISTS "Activity_organizationId_createdAt_idx" ON "Activity"("organizationId", "createdAt");

-- Lead timeline entry type -> activity type (also used for the backfill below)
CREATE OR REPLACE FUNCTION activity_type_for_lead_entry(t TEXT) RETURNS TEXT AS $$
  SELECT CASE t
    WHEN 'RECEIVED' THEN 'lead_created'
    WHEN 'ASSIGNED' THEN 'lead_assigned'
    WHEN 'UNASSIGNED' THEN 'lead_assigned'
    WHEN 'STAGE_CHANGED' THEN 'stage_changed'
    WHEN 'NOTE' THEN 'note_added'
    WHEN 'CALL_LOGGED' THEN 'call_logged'
    WHEN 'WHATSAPP_LOGGED' THEN 'whatsapp_sent'
    WHEN 'DOCUMENT' THEN 'document_uploaded'
    WHEN 'VOICE_NOTE' THEN 'voice_note'
    WHEN 'TASK_CREATED' THEN 'followup_set'
    WHEN 'TASK_DONE' THEN 'followup_done'
    WHEN 'VIEWING_BOOKED' THEN 'viewing_scheduled'
    WHEN 'VIEWING_DONE' THEN 'viewing_completed'
    WHEN 'VIEWING_CANCELLED' THEN 'viewing_cancelled'
    WHEN 'MERGED' THEN 'lead_merged'
    WHEN 'PROPERTY_LINKED' THEN 'property_linked'
    WHEN 'GROUP_CHANGED' THEN 'group_changed'
    ELSE NULL END
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION activity_from_lead_entry() RETURNS trigger AS $$
DECLARE t TEXT; src TEXT; lid INTEGER; o TEXT; n TEXT;
BEGIN
  t := activity_type_for_lead_entry(NEW."type");
  IF t IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(l."sourceLabel", CASE l."source"::text WHEN 'PROPERTY_FINDER' THEN 'Property Finder' WHEN 'META' THEN 'Facebook / Instagram' WHEN 'MANUAL' THEN 'Manual' ELSE 'Import' END), l."listingId"
    INTO src, lid FROM "Lead" l WHERE l."id" = NEW."leadId";
  IF t = 'stage_changed' AND NEW."text" LIKE 'Stage: % → %' THEN
    o := split_part(substr(NEW."text", 8), ' → ', 1);
    n := split_part(substr(NEW."text", 8), ' → ', 2);
  END IF;
  INSERT INTO "Activity" ("id", "organizationId", "type", "agentId", "leadId", "listingId", "oldValue", "newValue", "note", "source", "createdAt")
  VALUES (gen_random_uuid()::text, NEW."organizationId", t, NEW."userId", NEW."leadId", lid, o, n, NEW."text", src, NEW."createdAt");
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "trg_activity_lead_entry" ON "LeadActivity";
CREATE TRIGGER "trg_activity_lead_entry" AFTER INSERT ON "LeadActivity" FOR EACH ROW EXECUTE FUNCTION activity_from_lead_entry();

-- Listing audit entry -> activity
CREATE OR REPLACE FUNCTION activity_from_audit() RETURNS trigger AS $$
DECLARE t TEXT; org TEXT;
BEGIN
  t := CASE NEW."action"
    WHEN 'CREATED' THEN 'listing_created'
    WHEN 'DEACTIVATED' THEN 'listing_deactivated'
    WHEN 'REACTIVATED' THEN 'listing_activated'
    WHEN 'AVAILABILITY_CHANGED' THEN 'listing_status_changed'
    ELSE 'listing_edited' END;
  SELECT "organizationId" INTO org FROM "Listing" WHERE "id" = NEW."listingId";
  IF org IS NULL THEN RETURN NEW; END IF;
  INSERT INTO "Activity" ("id", "organizationId", "type", "agentId", "listingId", "oldValue", "newValue", "note", "createdAt")
  VALUES (gen_random_uuid()::text, org, t, NEW."userId", NEW."listingId",
    CASE WHEN NEW."action" = 'PRIVATE_DETAILS_UPDATED' THEN NULL ELSE NEW."oldValue" END,
    CASE WHEN NEW."action" = 'PRIVATE_DETAILS_UPDATED' THEN NULL ELSE NEW."newValue" END,
    NEW."action", NEW."timestamp");
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "trg_activity_audit" ON "AuditLog";
CREATE TRIGGER "trg_activity_audit" AFTER INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION activity_from_audit();

-- Portal publish / unpublish / error -> activity (Property Finder, Qatar Living, Property Oryx)
CREATE OR REPLACE FUNCTION activity_from_portal() RETURNS trigger AS $$
DECLARE org TEXT;
BEGIN
  IF NEW."portal"::text NOT IN ('PROPERTY_FINDER', 'QATAR_LIVING', 'PROPERTY_ORYX') THEN RETURN NEW; END IF;
  SELECT "organizationId" INTO org FROM "Listing" WHERE "id" = NEW."listingId";
  IF org IS NULL THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND NEW."enabled") OR (TG_OP = 'UPDATE' AND NEW."enabled" AND NOT OLD."enabled") THEN
    INSERT INTO "Activity" ("id", "organizationId", "type", "listingId", "newValue") VALUES (gen_random_uuid()::text, org, 'listing_published', NEW."listingId", NEW."portal"::text);
  ELSIF TG_OP = 'UPDATE' AND OLD."enabled" AND NOT NEW."enabled" THEN
    INSERT INTO "Activity" ("id", "organizationId", "type", "listingId", "newValue") VALUES (gen_random_uuid()::text, org, 'listing_unpublished', NEW."listingId", NEW."portal"::text);
  END IF;
  IF NEW."lastError" IS NOT NULL AND (TG_OP = 'INSERT' OR OLD."lastError" IS DISTINCT FROM NEW."lastError") THEN
    INSERT INTO "Activity" ("id", "organizationId", "type", "listingId", "newValue", "note") VALUES (gen_random_uuid()::text, org, 'listing_portal_error', NEW."listingId", NEW."portal"::text, left(NEW."lastError", 500));
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "trg_activity_portal" ON "PortalListing";
CREATE TRIGGER "trg_activity_portal" AFTER INSERT OR UPDATE ON "PortalListing" FOR EACH ROW EXECUTE FUNCTION activity_from_portal();

-- Backfill from the existing lead timeline and listing audit trail (only while the log is still empty)
INSERT INTO "Activity" ("id", "organizationId", "type", "agentId", "leadId", "listingId", "oldValue", "newValue", "note", "source", "createdAt")
SELECT gen_random_uuid()::text, a."organizationId", activity_type_for_lead_entry(a."type"), a."userId", a."leadId", l."listingId",
  CASE WHEN a."type" = 'STAGE_CHANGED' AND a."text" LIKE 'Stage: % → %' THEN split_part(substr(a."text", 8), ' → ', 1) END,
  CASE WHEN a."type" = 'STAGE_CHANGED' AND a."text" LIKE 'Stage: % → %' THEN split_part(substr(a."text", 8), ' → ', 2) END,
  a."text",
  COALESCE(l."sourceLabel", CASE l."source"::text WHEN 'PROPERTY_FINDER' THEN 'Property Finder' WHEN 'META' THEN 'Facebook / Instagram' WHEN 'MANUAL' THEN 'Manual' ELSE 'Import' END),
  a."createdAt"
FROM "LeadActivity" a JOIN "Lead" l ON l."id" = a."leadId"
WHERE activity_type_for_lead_entry(a."type") IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Activity");

INSERT INTO "Activity" ("id", "organizationId", "type", "agentId", "listingId", "oldValue", "newValue", "note", "createdAt")
SELECT gen_random_uuid()::text, p."organizationId",
  CASE g."action" WHEN 'CREATED' THEN 'listing_created' WHEN 'DEACTIVATED' THEN 'listing_deactivated' WHEN 'REACTIVATED' THEN 'listing_activated' WHEN 'AVAILABILITY_CHANGED' THEN 'listing_status_changed' ELSE 'listing_edited' END,
  g."userId", g."listingId",
  CASE WHEN g."action" = 'PRIVATE_DETAILS_UPDATED' THEN NULL ELSE g."oldValue" END,
  CASE WHEN g."action" = 'PRIVATE_DETAILS_UPDATED' THEN NULL ELSE g."newValue" END,
  g."action", g."timestamp"
FROM "AuditLog" g JOIN "Listing" p ON p."id" = g."listingId"
WHERE NOT EXISTS (SELECT 1 FROM "Activity" WHERE "type" LIKE 'listing_%');

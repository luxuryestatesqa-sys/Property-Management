import { Prisma } from "@prisma/client";

// Everything the Activities page can filter by. The same query string drives the page URL, the list, the
// summary and the CSV export, so a filtered view can be bookmarked or shared.
export interface ActivityFilters {
  from?: string; // yyyy-mm-dd, Qatar time
  to?: string;
  agents: string[]; // user ids, plus "system"
  types: string[];
  stage?: string;
  sources: string[];
  property?: string;
  lead?: string;
}

const csv = (v: string | null) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 60) : []);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseFilters(sp: URLSearchParams): ActivityFilters {
  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;
  return {
    from: from && DAY.test(from) ? from : undefined,
    to: to && DAY.test(to) ? to : undefined,
    agents: csv(sp.get("agents")),
    types: csv(sp.get("types")),
    stage: sp.get("stage")?.trim().slice(0, 60) || undefined,
    sources: csv(sp.get("sources")),
    property: sp.get("property")?.trim().slice(0, 80) || undefined,
    lead: sp.get("lead")?.trim().slice(0, 80) || undefined,
  };
}

// Qatar is UTC+3 all year (no daylight saving), so a Qatar day is a fixed 24h window.
export const qatarStart = (day: string) => new Date(`${day}T00:00:00+03:00`);
export const qatarEndExclusive = (day: string) => new Date(qatarStart(day).getTime() + 86400000);

// Rows are read as: Activity a, with Lead l, Listing p and User u joined for searching and display.
export const ACTIVITY_FROM = Prisma.sql`"Activity" a LEFT JOIN "Lead" l ON l."id" = a."leadId" LEFT JOIN "Listing" p ON p."id" = a."listingId" LEFT JOIN "User" u ON u."id" = a."agentId"`;

// `team`: for a manager of a team, the people whose activities they may see (themselves and the team); null = everyone.
export function buildWhere(orgId: string, f: ActivityFilters, viewer: { id: string; manager: boolean; team?: string[] | null }): Prisma.Sql {
  const c: Prisma.Sql[] = [Prisma.sql`a."organizationId" = ${orgId}`];
  // An agent sees only their own activities.
  if (!viewer.manager) c.push(Prisma.sql`a."agentId" = ${viewer.id}`);
  else if (viewer.team) c.push(Prisma.sql`a."agentId" = ANY(${viewer.team}::text[])`);
  if (f.from) c.push(Prisma.sql`a."createdAt" >= ${qatarStart(f.from)}`);
  if (f.to) c.push(Prisma.sql`a."createdAt" < ${qatarEndExclusive(f.to)}`);
  if (f.agents.length && viewer.manager) {
    const ids = f.agents.filter((x) => x !== "system");
    c.push(f.agents.includes("system") ? Prisma.sql`(a."agentId" IS NULL OR a."agentId" = ANY(${ids}::text[]))` : Prisma.sql`a."agentId" = ANY(${ids}::text[])`);
  }
  if (f.types.length) c.push(Prisma.sql`a."type" = ANY(${f.types}::text[])`);
  if (f.stage) c.push(Prisma.sql`(a."type" = 'stage_changed' AND (a."oldValue" = ${f.stage} OR a."newValue" = ${f.stage}))`);
  if (f.sources.length) {
    const ors = f.sources.flatMap((s) =>
      s === "pf"
        ? [Prisma.sql`a."source" ILIKE 'Property Finder%'`]
        : s === "facebook"
          ? [Prisma.sql`a."source" ILIKE 'Facebook%'`]
          : s === "instagram"
            ? [Prisma.sql`a."source" ILIKE '%Instagram%'`]
            : s === "whatsapp"
              ? [Prisma.sql`a."source" ILIKE 'WhatsApp%'`, Prisma.sql`l."channel"::text = 'WHATSAPP'`]
              : s === "manual"
                ? [Prisma.sql`a."source" ILIKE 'Manual%'`]
                : []
    );
    if (ors.length) c.push(Prisma.sql`(${Prisma.join(ors, " OR ")})`);
  }
  if (f.property) {
    const like = `%${f.property.replace(/[%_]/g, "")}%`;
    const code = /^(lst-?)?(\d+)$/i.exec(f.property.trim());
    c.push(code ? Prisma.sql`(a."listingId" = ${Number(code[2])} OR p."buildingName" ILIKE ${like})` : Prisma.sql`(p."buildingName" ILIKE ${like} OR p."community" ILIKE ${like})`);
  }
  if (f.lead) {
    const like = `%${f.lead.replace(/[%_]/g, "")}%`;
    const digits = f.lead.replace(/\D/g, "");
    c.push(digits.length >= 4 ? Prisma.sql`(l."name" ILIKE ${like} OR l."phone" LIKE ${`%${digits}%`})` : Prisma.sql`(l."name" ILIKE ${like} OR (a."type" = 'lead_deleted' AND a."note" ILIKE ${like}))`);
  }
  return Prisma.join(c, " AND ");
}

export const ROW_SELECT = Prisma.sql`a."id", a."type", a."createdAt", a."agentId", u."name" AS "agentName", a."leadId", l."name" AS "leadName", l."phone" AS "leadPhone", a."listingId", p."buildingName" AS "listingName", p."community" AS "listingCommunity", a."oldValue", a."newValue", a."note", a."source"`;

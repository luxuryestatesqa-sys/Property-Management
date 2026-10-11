import { listLeads, PropertyFinderApiError } from "@/lib/propertyFinder/client";
import { ingestPropertyFinderLead } from "./ingest";
import { normalizePfLead } from "./pfMapping";

export interface LeadSyncResult {
  fetched: number;
  created: number;
  updated: number;
}

const MAX_PAGES = 40; // 2,000 leads per run is far more than 3 months of one agency
const DAY_MS = 86_400_000;

export class LeadsScopeError extends Error {
  constructor() {
    super("Property Finder refused the request. The API key needs the \"leads:read\" scope - create a new key in PF Expert (Developer Resources) with Leads enabled and enter it in Settings.");
    this.name = "LeadsScopeError";
  }
}

// Pulls the agency's recent Property Finder leads and stores any it does not have
// yet. Property Finder only serves the last 3 months, so `days` is capped just
// inside that window.
export async function syncPropertyFinderLeads(orgId: string, days = 89): Promise<LeadSyncResult> {
  const createdAtFrom = new Date(Date.now() - Math.min(days, 89) * DAY_MS);
  const result: LeadSyncResult = { fetched: 0, created: 0, updated: 0 };

  for (let page = 1; page <= MAX_PAGES; page++) {
    let res;
    try {
      res = await listLeads(orgId, { page, perPage: 50, createdAtFrom });
    } catch (err) {
      if (err instanceof PropertyFinderApiError && err.status === 403) throw new LeadsScopeError();
      throw err;
    }
    for (const lead of res.data) {
      const { created } = await ingestPropertyFinderLead(orgId, normalizePfLead(lead), lead);
      result.fetched++;
      if (created) result.created++;
      else result.updated++;
    }
    if (!res.pagination.nextPage || res.data.length === 0) break;
  }
  return result;
}

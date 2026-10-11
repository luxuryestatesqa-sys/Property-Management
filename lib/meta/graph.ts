import { graphVersion, META_SCOPES, metaEnv } from "./config";
import { appSecretProof } from "./signature";

// A thin client for the parts of Meta's Graph API this app uses. Every function takes the token to
// use, so a call can never silently use another agency's connection.

export class GraphError extends Error {
  constructor(message: string, public httpStatus: number, public code?: number, public retryable = false) {
    super(message);
  }
}

// Meta's own "try again later" codes (temporary problem, rate limits) and server errors.
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);
// The token or permission is the problem, so retrying will never help (expired / revoked / missing permission).
export const isTokenProblem = (e: unknown) => e instanceof GraphError && (e.code === 190 || e.code === 10 || (e.code !== undefined && e.code >= 200 && e.code < 300) || e.httpStatus === 401 || e.httpStatus === 403);

async function graph<T>(path: string, opts: { method?: "GET" | "POST" | "DELETE"; token?: string; params?: Record<string, string> } = {}): Promise<T> {
  const { appSecret } = metaEnv();
  const url = new URL(path.startsWith("http") ? path : `https://graph.facebook.com/${graphVersion()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
    if (appSecret && !url.searchParams.has("appsecret_proof")) url.searchParams.set("appsecret_proof", appSecretProof(opts.token, appSecret));
  }
  let res: Response;
  try {
    res = await fetch(url, { method: opts.method ?? "GET", headers, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    throw new GraphError(`Couldn't reach Facebook: ${e instanceof Error ? e.message : "network error"}`, 0, undefined, true);
  }
  const body = (await res.json().catch(() => null)) as { error?: { message?: string; code?: number }; [k: string]: unknown } | null;
  if (!res.ok || body?.error) {
    const code = body?.error?.code;
    throw new GraphError(body?.error?.message ?? `Facebook returned ${res.status}`, res.status, code, res.status >= 500 || (code !== undefined && RETRYABLE_CODES.has(code)));
  }
  return body as T;
}

// --- Logging in -----------------------------------------------------------------------------

export function loginUrl(redirectUri: string, state: string): string {
  const { appId, loginConfigId } = metaEnv();
  const u = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
  u.searchParams.set("client_id", appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  if (loginConfigId) u.searchParams.set("config_id", loginConfigId);
  else u.searchParams.set("scope", META_SCOPES.join(","));
  return u.toString();
}

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const { appId, appSecret } = metaEnv();
  const r = await graph<{ access_token: string }>("oauth/access_token", { params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code } });
  return r.access_token;
}

// A short-lived user token becomes a ~60 day one; Page tokens made from it do not expire.
export async function longLivedUserToken(token: string): Promise<string> {
  const { appId, appSecret } = metaEnv();
  const r = await graph<{ access_token: string }>("oauth/access_token", { params: { grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: token } });
  return r.access_token;
}

export const getMe = (token: string) => graph<{ id: string; name?: string }>("me", { token, params: { fields: "id,name" } });

export interface ManagedPage {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
}

export async function listManagedPages(userToken: string): Promise<ManagedPage[]> {
  const pages: ManagedPage[] = [];
  let next: string | undefined = "me/accounts";
  let params: Record<string, string> | undefined = { fields: "id,name,access_token,tasks", limit: "100" };
  for (let i = 0; i < 10 && next; i++) {
    const r: { data: ManagedPage[]; paging?: { next?: string } } = await graph(next, { token: userToken, params });
    pages.push(...r.data);
    next = r.paging?.next;
    params = undefined;
  }
  return pages;
}

// --- Receiving leads ------------------------------------------------------------------------

export const subscribePage = (pageId: string, pageToken: string) => graph<{ success: boolean }>(`${pageId}/subscribed_apps`, { method: "POST", token: pageToken, params: { subscribed_fields: "leadgen" } });
export const unsubscribePage = (pageId: string, pageToken: string) => graph<{ success: boolean }>(`${pageId}/subscribed_apps`, { method: "DELETE", token: pageToken });

export interface GraphLead {
  id: string;
  created_time?: string;
  form_id?: string;
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  platform?: string;
  is_organic?: boolean;
  field_data?: { name: string; values: string[] }[];
}

const LEAD_FIELDS = "id,created_time,form_id,ad_id,ad_name,adset_name,campaign_name,platform,is_organic,field_data";
const LEAD_FIELDS_BASIC = "id,created_time,form_id,ad_id,field_data";

// Ad / campaign names need extra permission on some apps; if Meta refuses them we still get the lead.
export async function fetchLead(leadgenId: string, pageToken: string): Promise<GraphLead> {
  try {
    return await graph<GraphLead>(leadgenId, { token: pageToken, params: { fields: LEAD_FIELDS } });
  } catch (e) {
    if (e instanceof GraphError && !e.retryable && e.code !== 190) return graph<GraphLead>(leadgenId, { token: pageToken, params: { fields: LEAD_FIELDS_BASIC } });
    throw e;
  }
}

export async function fetchFormName(formId: string, pageToken: string): Promise<string | null> {
  try {
    return (await graph<{ name?: string }>(formId, { token: pageToken, params: { fields: "name" } })).name ?? null;
  } catch {
    return null;
  }
}

export const listForms = async (pageId: string, pageToken: string) => (await graph<{ data: { id: string; name: string; status?: string }[] }>(`${pageId}/leadgen_forms`, { token: pageToken, params: { fields: "id,name,status", limit: "100" } })).data;

export interface FormInfo {
  id: string;
  name: string;
  status?: string; // ACTIVE | ARCHIVED | DELETED | DRAFT
  leads_count?: number;
  created_time?: string;
}

// Forms with the details the Settings screen shows (how many leads, whether it is still running).
export async function listFormsDetailed(pageId: string, pageToken: string): Promise<FormInfo[]> {
  const out: FormInfo[] = [];
  let next: string | undefined = `${pageId}/leadgen_forms`;
  let params: Record<string, string> | undefined = { fields: "id,name,status,leads_count,created_time", limit: "100" };
  for (let i = 0; i < 5 && next; i++) {
    const r: { data: FormInfo[]; paging?: { next?: string } } = await graph(next, { token: pageToken, params });
    out.push(...r.data);
    next = r.paging?.next;
    params = undefined;
  }
  return out;
}

export interface BusinessPages {
  id: string;
  name: string;
  pageIds: string[];
}

// The Business portfolios (Business Managers) the person belongs to, with the Pages each owns or has
// been given access to. Needs the business_management permission; without it Facebook refuses and we
// simply return an empty list, so connecting still works, just without the grouping.
export async function listBusinessesWithPages(userToken: string): Promise<BusinessPages[]> {
  let businesses: { id: string; name: string }[];
  try {
    businesses = (await graph<{ data: { id: string; name: string }[] }>("me/businesses", { token: userToken, params: { fields: "id,name", limit: "100" } })).data;
  } catch {
    return [];
  }
  const out: BusinessPages[] = [];
  for (const b of businesses) {
    const ids = new Set<string>();
    for (const edge of ["owned_pages", "client_pages"]) {
      let next: string | undefined = `${b.id}/${edge}`;
      let params: Record<string, string> | undefined = { fields: "id", limit: "100" };
      try {
        for (let i = 0; i < 10 && next; i++) {
          const r: { data: { id: string }[]; paging?: { next?: string } } = await graph(next, { token: userToken, params });
          r.data.forEach((p) => ids.add(p.id));
          next = r.paging?.next;
          params = undefined;
        }
      } catch {
        // an edge this person can't read: skip it
      }
    }
    out.push({ id: b.id, name: b.name, pageIds: [...ids] });
  }
  return out;
}

// Leads of one form, newest first. Meta keeps them for 90 days.
export async function listFormLeads(formId: string, pageToken: string, max = 500): Promise<GraphLead[]> {
  const out: GraphLead[] = [];
  let next: string | undefined = `${formId}/leads`;
  let params: Record<string, string> | undefined = { fields: LEAD_FIELDS_BASIC, limit: "100" };
  while (next && out.length < max) {
    const r: { data: GraphLead[]; paging?: { next?: string } } = await graph(next, { token: pageToken, params });
    out.push(...r.data);
    next = r.paging?.next;
    params = undefined;
  }
  return out.slice(0, max);
}

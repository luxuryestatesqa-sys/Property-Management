import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { makeRulePicker } from "@/lib/leads/rules";
import { fetchFormName, fetchLead, GraphError, isTokenProblem, listFormLeads, listForms } from "./graph";
import { ingestMetaLead } from "./ingest";

// Everything that happens to a connected Page's lead, in one place so the webhook, the manual
// "Fetch leads" button and the tests all behave the same.

export async function recordPageError(pageDbId: string, message: string | null) {
  await prisma.metaPage.update({ where: { id: pageDbId }, data: { lastError: message ? message.slice(0, 300) : null } }).catch(() => {});
}

export const friendlyGraphError = (e: unknown) =>
  isTokenProblem(e) ? "Facebook no longer allows access to this page. Reconnect it from Settings." : e instanceof GraphError ? e.message : e instanceof Error ? e.message : "Something went wrong";

// A webhook said "lead X arrived on page P": fetch it and save it.
export async function handleLeadgenEvent(page: { id: string; organizationId: string; name: string; accessToken: string; enabled: boolean; disabledForms?: string[] }, leadgenId: string, formId?: string) {
  if (!page.enabled) return { skipped: true as const };
  // The agency switched this form off: don't even ask Facebook for the lead.
  if (formId && page.disabledForms?.includes(formId)) return { skipped: true as const };
  const token = decryptSecret(page.accessToken);
  const lead = await fetchLead(leadgenId, token);
  if (lead.form_id && page.disabledForms?.includes(lead.form_id)) return { skipped: true as const };
  const formName = (formId ?? lead.form_id) ? await fetchFormName((formId ?? lead.form_id)!, token) : null;
  const r = await ingestMetaLead(page.organizationId, lead, { pageName: page.name, formName });
  await prisma.metaPage.update({ where: { id: page.id }, data: { lastLeadAt: new Date(), lastError: null } });
  return { skipped: false as const, ...r };
}

// "Fetch leads now": catches anything a webhook missed. Leads Meta still holds (up to 90 days).
export async function syncPage(page: { id: string; organizationId: string; name: string; accessToken: string }, onlyFormId?: string): Promise<{ fetched: number; created: number }> {
  const token = decryptSecret(page.accessToken);
  const row = await prisma.metaPage.findUniqueOrThrow({ where: { id: page.id }, select: { pageId: true, disabledForms: true } });
  const pageId = row.pageId;
  const pick = await makeRulePicker(page.organizationId);
  let fetched = 0;
  let created = 0;
  for (const form of await listForms(pageId, token)) {
    if (form.status === "DELETED" || row.disabledForms.includes(form.id) || (onlyFormId && form.id !== onlyFormId)) continue;
    for (const l of await listFormLeads(form.id, token)) {
      fetched++;
      const r = await ingestMetaLead(page.organizationId, l, { pageName: page.name, formName: form.name, pick });
      if (r.created) created++;
    }
  }
  if (created) await prisma.metaPage.update({ where: { id: page.id }, data: { lastLeadAt: new Date(), lastError: null } });
  return { fetched, created };
}

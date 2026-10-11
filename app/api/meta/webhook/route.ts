import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { metaEnv } from "@/lib/meta/config";
import { verifyWebhookSignature } from "@/lib/meta/signature";
import { GraphError, isTokenProblem } from "@/lib/meta/graph";
import { friendlyGraphError, handleLeadgenEvent, recordPageError } from "@/lib/meta/sync";

// Step 1 of Meta's webhook setup: Meta calls this once with a challenge to prove the address is ours.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { verifyToken } = metaEnv();
  if (verifyToken && sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") === verifyToken) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

interface LeadgenChange {
  field?: string;
  value?: { leadgen_id?: string | number; page_id?: string | number; form_id?: string | number };
}

// New leads. Meta sends only the lead's id; we fetch the details with the Page's own token. There is
// no login on this request, so it is trusted only if Meta's signature (made with the App Secret) is
// valid, and the agency is found from the Page id, never from anything the sender claims.
// A temporary failure answers 500 so Meta retries; a lasting one (token revoked) is recorded on the
// Page so the admin sees it in Settings, and answered 200 so Meta does not retry forever.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const { appSecret } = metaEnv();
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"), appSecret)) return new NextResponse("Invalid signature", { status: 401 });

  let body: { object?: string; entry?: { changes?: LeadgenChange[] }[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  if (body.object !== "page") return NextResponse.json({ ok: true });

  let retry = false;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (change.field !== "leadgen" || !v?.leadgen_id || !v.page_id) continue;
      const page = await prisma.metaPage.findUnique({ where: { pageId: String(v.page_id) } });
      if (!page) continue; // a Page nobody here has connected
      try {
        await handleLeadgenEvent(page, String(v.leadgen_id), v.form_id ? String(v.form_id) : undefined);
      } catch (e) {
        if (e instanceof GraphError && e.retryable && !isTokenProblem(e)) retry = true;
        else await recordPageError(page.id, friendlyGraphError(e));
        console.error("meta webhook: lead", String(v.leadgen_id), "failed:", e instanceof Error ? e.message : e);
      }
    }
  }
  return retry ? new NextResponse("Try again", { status: 500 }) : NextResponse.json({ ok: true });
}

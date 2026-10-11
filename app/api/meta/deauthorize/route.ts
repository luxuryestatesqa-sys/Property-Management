import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { metaEnv } from "@/lib/meta/config";
import { parseSignedRequest } from "@/lib/meta/signature";

// Meta calls this when a person removes our app from their Facebook account. Their Pages stop
// sending leads, so we switch them off and say why. (The leads already received stay.)
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const data = parseSignedRequest<{ user_id?: string }>(String(form?.get("signed_request") ?? ""), metaEnv().appSecret);
  if (!data?.user_id) return new NextResponse("Invalid request", { status: 400 });
  await prisma.metaPage.updateMany({ where: { fbUserId: String(data.user_id) }, data: { enabled: false, lastError: "The Facebook account that connected this page removed the app. Reconnect it from Settings." } });
  return NextResponse.json({ ok: true });
}

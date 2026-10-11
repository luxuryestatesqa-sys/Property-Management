import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { metaEnv } from "@/lib/meta/config";
import { parseSignedRequest } from "@/lib/meta/signature";
import { getAppBaseUrl } from "@/lib/propertyFinder/sync";

// Meta's "data deletion request" callback (required for apps): when a person asks Facebook to delete
// the data an app holds about them. What we hold about that person is the connection they made, so we
// erase it (the Page tokens). Leads their Pages already delivered belong to the agency and stay.
// The answer is the address of a page where they can see the request was handled.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const data = parseSignedRequest<{ user_id?: string }>(String(form?.get("signed_request") ?? ""), metaEnv().appSecret);
  if (!data?.user_id) return new NextResponse("Invalid request", { status: 400 });

  await prisma.metaPage.deleteMany({ where: { fbUserId: String(data.user_id) } });

  const code = randomBytes(9).toString("hex");
  let base = req.nextUrl.origin;
  try {
    base = getAppBaseUrl(req.nextUrl.origin);
  } catch {
    // keep the request's own address
  }
  return NextResponse.json({ url: `${base}/data-deletion?code=${code}`, confirmation_code: code });
}

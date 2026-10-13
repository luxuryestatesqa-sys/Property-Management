import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/api-helpers";
import { rateLimited } from "@/lib/rateLimit";
import { passwordSchema } from "@/lib/validation";
import { readResetToken, resetTokenMatches } from "@/lib/passwordReset";
import { createIdentity, firebaseEnabled, confirmFirebaseReset } from "@/lib/identity";

const INVALID = "This reset link is invalid or has expired. Request a new one.";

// Public: sets a new password from a reset link. Updates Firebase Authentication (when enabled) and the
// database hash together, so the app can still be moved back to database logins.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(`pwreset-confirm:${ip}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const { value, error } = await parseJsonBody<{ token?: unknown; oobCode?: unknown; password?: unknown }>(req);
  if (error) return error;

  // Link from Firebase's reset email: Firebase checks the code and stores the password; we keep the
  // database hash in step so the app can still be moved back to database logins.
  if (typeof value?.oobCode === "string" && firebaseEnabled()) {
    const pw = passwordSchema.safeParse(value.password);
    if (!pw.success) return NextResponse.json({ error: pw.error.issues[0]?.message ?? "Invalid password" }, { status: 400 });
    let email: string | null;
    try {
      email = await confirmFirebaseReset(value.oobCode, pw.data);
    } catch (e) {
      console.error("password reset:", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "Couldn't reset the password right now. Please try again." }, { status: 502 });
    }
    if (!email) return NextResponse.json({ error: INVALID }, { status: 400 });
    await prisma.user.updateMany({ where: { email }, data: { passwordHash: await bcrypt.hash(pw.data, 10) } });
    return NextResponse.json({ ok: true });
  }
  const payload = readResetToken(typeof value?.token === "string" ? value.token : null);
  if (!payload) return NextResponse.json({ error: INVALID }, { status: 400 });

  const parsed = passwordSchema.safeParse(value?.password);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid password" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: payload.uid }, include: { organization: { select: { status: true } } } });
  if (!user || user.status !== "ACTIVE" || user.organization.status !== "ACTIVE" || !resetTokenMatches(payload, user.passwordHash)) {
    return NextResponse.json({ error: INVALID }, { status: 400 });
  }

  try {
    // createIdentity also repairs a user who was never copied into Firebase.
    await createIdentity({ id: user.id, email: user.email, name: user.name, password: parsed.data });
  } catch (e) {
    console.error("password reset:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't reset the password right now. Please try again." }, { status: 502 });
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(parsed.data, 10) } });
  return NextResponse.json({ ok: true });
}

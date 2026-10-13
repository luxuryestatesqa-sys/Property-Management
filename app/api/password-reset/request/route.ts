import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/api-helpers";
import { rateLimited } from "@/lib/rateLimit";
import { createResetToken, RESET_TTL_SECONDS } from "@/lib/passwordReset";
import { sendMail } from "@/lib/mail";
import { firebaseEnabled, sendFirebaseResetEmail } from "@/lib/identity";

// Public: emails a one-hour reset link. The answer is always the same whether or not the email has an
// account, so the form cannot be used to find out who is registered.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(`pwreset-ip:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const { value, error } = await parseJsonBody<{ email?: unknown }>(req);
  if (error) return error;
  const email = typeof value?.email === "string" ? value.email.toLowerCase().trim() : "";
  if (!email || email.length > 254 || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (rateLimited(`pwreset-email:${email}`, 3, 60 * 60 * 1000)) return NextResponse.json({ ok: true });

  const user = await prisma.user.findUnique({ where: { email }, include: { organization: { select: { status: true } } } });
  if (user && user.status === "ACTIVE" && user.organization.status === "ACTIVE") {
    if (firebaseEnabled()) {
      // Firebase's own mail service sends the email (see sendFirebaseResetEmail).
      try {
        await sendFirebaseResetEmail(user);
      } catch (e) {
        console.error("password reset:", e instanceof Error ? e.message : e);
      }
      return NextResponse.json({ ok: true });
    }
    const base = process.env.APP_BASE_URL || req.nextUrl.origin;
    const link = `${base.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(createResetToken(user))}`;
    const minutes = RESET_TTL_SECONDS / 60;
    await sendMail(
      user.email,
      "Reset your password",
      `Hi ${user.name},\n\nUse this link to choose a new password (valid for ${minutes} minutes, works once):\n${link}\n\nIf you didn't ask for this, ignore this email - your password stays the same.`,
      `<p>Hi ${user.name.replace(/[<>&]/g, "")},</p><p><a href="${link}">Choose a new password</a> (valid for ${minutes} minutes, works once).</p><p>If you didn't ask for this, ignore this email - your password stays the same.</p>`
    );
  }
  return NextResponse.json({ ok: true });
}

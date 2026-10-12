import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/api-helpers";
import { signupSchema } from "@/lib/validation";
import { slugify } from "@/lib/org";
import { rateLimited } from "@/lib/rateLimit";
import { ensureStages } from "@/lib/leads/stages";
import { createIdentity } from "@/lib/identity";

// Public: creates a brand-new agency plus its first account (the OWNER).
// Set ALLOW_SIGNUP=false to close self-service sign-up (e.g. once you only
// want to onboard agencies by hand).
export async function POST(req: NextRequest) {
  if (process.env.ALLOW_SIGNUP === "false") {
    return NextResponse.json({ error: "Sign-up is closed. Ask the platform owner to create your agency." }, { status: 403 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(`signup:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many sign-up attempts. Please try again later." }, { status: 429 });
  }

  const { value, error } = await parseJsonBody<Record<string, unknown>>(req);
  if (error) return error;

  // Honeypot: real people never fill this hidden field, bots usually do.
  if (typeof value?.website === "string" && value.website !== "") {
    return NextResponse.json({ ok: true });
  }

  const parsed = signupSchema.safeParse(value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const email = data.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  // A short readable slug, made unique with a random suffix if the name is taken.
  const base = slugify(data.agencyName);
  let slug = base;
  for (let attempt = 0; attempt < 5 && (await prisma.organization.findUnique({ where: { slug }, select: { id: true } })); attempt++) {
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  try {
    const { org, userId } = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({ data: { name: data.agencyName, slug } });
      const user = await tx.user.create({
        data: { organizationId: created.id, name: data.name, email, whatsapp: data.whatsapp, passwordHash, role: "OWNER" },
      });
      return { org: created, userId: user.id };
    });
    try {
      await createIdentity({ id: userId, email, name: data.name, password: data.password });
    } catch (e) {
      // No sign-in account means nobody could ever log in: undo the agency so they can retry.
      await prisma.$transaction([prisma.user.delete({ where: { id: userId } }), prisma.organization.delete({ where: { id: org.id } })]);
      console.error("signup: identity creation failed:", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "Couldn't create your account right now. Please try again." }, { status: 502 });
    }
    // The standard lead pipeline is ready the first time the owner opens Leads.
    await ensureStages(org.id);
  } catch (e) {
    // Two sign-ups racing for the same email or slug: the unique index decides.
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

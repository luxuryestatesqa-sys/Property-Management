import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const PHONE = /^\+?[\d\s\-()]{6,20}$/;

// Owners / landlords of the agency's properties. They hold private contact details, so the list is for
// managers and above, plus the agent who created the listing an owner is linked to.
export async function GET() {
  const { session, db, error } = await requireSession();
  if (error) return error;
  const where = isManagerRole(session!.user.role) ? {} : { listings: { some: { createdById: session!.user.id } } };
  const owners = await db!.owner.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, whatsapp: true, email: true, notes: true, _count: { select: { listings: true } } }, take: 500 });
  return NextResponse.json({ owners });
}

// Anyone who adds listings can add the owner they are working with.
export async function POST(req: NextRequest) {
  const { db, orgId, error } = await requireSession();
  if (error) return error;
  const { value: body, error: bodyError } = await parseJsonBody<Record<string, unknown>>(req);
  if (bodyError) return bodyError;
  const name = text(body?.name, 120);
  if (name.length < 2) return NextResponse.json({ error: "Enter the owner's name" }, { status: 400 });
  const phone = text(body?.phone, 30);
  const whatsapp = text(body?.whatsapp, 30);
  if ((phone && !PHONE.test(phone)) || (whatsapp && !PHONE.test(whatsapp))) return NextResponse.json({ error: "Enter a valid phone number, e.g. +974 5000 0000" }, { status: 400 });
  const owner = await db!.owner.create({
    data: { organizationId: orgId!, name, phone: phone || null, whatsapp: whatsapp || null, email: text(body?.email, 120) || null, notes: text(body?.notes, 1000) || null },
    select: { id: true, name: true, phone: true, whatsapp: true, email: true, notes: true },
  });
  return NextResponse.json({ owner }, { status: 201 });
}

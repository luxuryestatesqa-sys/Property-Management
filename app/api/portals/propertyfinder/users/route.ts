import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { listUsers, describePropertyFinderError } from "@/lib/propertyFinder/client";

// Proxy for GET /v1/users - keeps the Property Finder API key/secret
// server-side. Read-only. An admin gets the full agency directory (needed to
// override which account any listing publishes under, or to link an agent's
// default account via PATCH /api/users/[id]). A regular agent only ever gets
// their OWN linked account back, not their colleagues' names/emails -
// picking which account a listing publishes under is an admin capability;
// an agent just sees their own.
export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const users = await listUsers();
    const active = users
      // Only accounts Property Finder itself considers active - an
      // inactive PF user can't actually receive leads or own a live
      // listing, so offering them here would let a listing get assigned
      // to an account that can't do anything with it.
      .filter((u) => u.status === "active" && u.publicProfile)
      .map((u) => ({
        publicProfileId: u.publicProfile!.id,
        name: u.publicProfile!.name,
        email: u.email,
      }));

    if (session!.user.role === "ADMIN") {
      return NextResponse.json({ users: active });
    }

    const me = await prisma.user.findUnique({ where: { id: session!.user.id }, select: { pfPublicProfileId: true } });
    return NextResponse.json({ users: active.filter((u) => u.publicProfileId === me?.pfPublicProfileId) });
  } catch (err) {
    return NextResponse.json({ error: describePropertyFinderError(err) }, { status: 502 });
  }
}

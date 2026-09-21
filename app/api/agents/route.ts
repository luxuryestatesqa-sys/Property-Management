import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

// Lightweight list of agents who have listings, for the Agent filter dropdown.
// Available to any authenticated user (not admin-only).
export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const users = await prisma.user.findMany({
    where: { listings: { some: {} } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ agents: users });
}

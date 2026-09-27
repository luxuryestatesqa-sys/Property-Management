import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-helpers";
import { getCreditBalance, describePropertyFinderError } from "@/lib/propertyFinder/client";

// Confirms the stored credentials actually work by making one real, cheap
// call - not just checking that the fields are non-empty.
export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const balance = await getCreditBalance();
    return NextResponse.json({ ok: true, balance });
  } catch (err) {
    return NextResponse.json({ ok: false, error: describePropertyFinderError(err) }, { status: 502 });
  }
}

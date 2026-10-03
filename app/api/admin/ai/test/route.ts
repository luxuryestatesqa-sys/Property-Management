import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-helpers";
import { testOpenAiKey } from "@/lib/ai/openai";

// Admin-only "does the saved OpenAI key work" check for the Settings card.
export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    await testOpenAiKey();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Key check failed" }, { status: 400 });
  }
}

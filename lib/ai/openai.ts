import { prisma } from "@/lib/prisma";

// Server-only: the OpenAI key lives in the database (admin Settings), is
// never sent to a browser, and is only ever used from here.
const OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

export class OpenAiNotConfiguredError extends Error {
  constructor() {
    super("AI isn't set up yet - an admin needs to add the OpenAI API key in Settings");
    this.name = "OpenAiNotConfiguredError";
  }
}

export async function getOpenAiKey(): Promise<string> {
  const credential = await prisma.portalCredential.findUnique({ where: { portal: "OPENAI" } });
  const key = credential?.apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new OpenAiNotConfiguredError();
  return key;
}

function friendlyOpenAiError(status: number, body: string): string {
  if (status === 401) return "OpenAI rejected the API key - an admin should re-enter it in Settings";
  if (status === 429) return "OpenAI is out of quota or rate-limited - check billing on the OpenAI account, then try again";
  if (status >= 500) return "OpenAI is temporarily unavailable - please try again in a moment";
  let detail = "";
  try {
    detail = JSON.parse(body)?.error?.message ?? "";
  } catch {
    // not JSON
  }
  return `OpenAI request failed (${status})${detail ? `: ${detail}` : ""}`;
}

// Returns the model's JSON-mode reply text.
export async function chatJson(system: string, user: string): Promise<string> {
  const key = await getOpenAiKey();
  let res: Response;
  try {
    res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        temperature: 0.7,
        max_tokens: 1400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(40_000),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error("The AI took too long to answer - please try again");
    }
    throw new Error("Couldn't reach OpenAI - please try again");
  }
  const text = await res.text();
  if (!res.ok) throw new Error(friendlyOpenAiError(res.status, text));
  const content = JSON.parse(text)?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenAI returned an empty answer - please try again");
  return content;
}

// Cheap key check for the Settings page (lists models; costs nothing).
export async function testOpenAiKey(): Promise<void> {
  const key = await getOpenAiKey();
  const res = await fetch(`${OPENAI_BASE}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(friendlyOpenAiError(res.status, await res.text().catch(() => "")));
}

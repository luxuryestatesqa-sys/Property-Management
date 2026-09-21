// Zod's z.flatten() puts whole-object errors in formErrors and per-field
// errors in fieldErrors. Most of our schemas fail on a single field (an
// invalid WhatsApp number, a missing name, ...), so formErrors is usually
// empty — pulling from fieldErrors too is what actually surfaces the reason.
export function extractErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (typeof error === "string" && error) return error;
  if (!error || typeof error !== "object") return fallback;
  const e = error as {
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  };
  if (e.formErrors?.[0]) return e.formErrors[0];
  if (e.fieldErrors) {
    for (const messages of Object.values(e.fieldErrors)) {
      if (messages && messages[0]) return messages[0];
    }
  }
  return fallback;
}

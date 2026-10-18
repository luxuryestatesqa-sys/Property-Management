import type { Metadata } from "next";
import { auth } from "@/auth";
import { getOrgBranding } from "@/lib/org";

// "Leads | Luxury Estates" for the browser tab, so open tabs can be told apart.
export async function pageTitle(section: string, detail?: string | null): Promise<Metadata> {
  const session = await auth();
  const org = session?.user?.organizationId ? await getOrgBranding(session.user.organizationId) : null;
  return { title: `${detail ? `${detail} · ` : ""}${section} | ${org?.name ?? "Listings Portal"}` };
}

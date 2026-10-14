import type { Metadata } from "next";
import { auth } from "@/auth";
import { getOrgBranding } from "@/lib/org";

export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  const org = session?.user?.organizationId ? await getOrgBranding(session.user.organizationId) : null;
  return { title: `Activities | ${org?.name ?? "Listings Portal"}` };
}

export default function ActivitiesLayout({ children }: { children: React.ReactNode }) {
  return children;
}

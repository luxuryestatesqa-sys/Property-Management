import { auth } from "@/auth";
import { tenantDb } from "@/lib/tenant";
import { isManagerRole } from "@/lib/roles";
import { pageTitle } from "@/lib/pageTitle";

// The lead's name in the browser tab. An agent sees it only for their own leads.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  let detail: string | null = null;
  if (session?.user?.organizationId && /^[\w-]{1,64}$/.test(id) && !["assignment", "rules", "stages"].includes(id)) {
    const lead = await tenantDb(session.user.organizationId).lead.findFirst({ where: { id }, select: { name: true, assignedToId: true } });
    if (lead && (isManagerRole(session.user.role) || lead.assignedToId === session.user.id)) detail = lead.name;
  }
  return pageTitle("Lead", detail);
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

import { can } from "@/lib/permissions";
import { auth } from "@/auth";
import { tenantDb } from "@/lib/tenant";
import { canViewListing } from "@/lib/listingPrivacy";
import { listingCode } from "@/lib/format";
import { pageTitle } from "@/lib/pageTitle";

// "LST-000083 · Marina Gate · Property | Luxury Estates" - names the listing in the browser tab.
// Someone else's private listing gets the plain title, like everywhere else.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const num = Number(id);
  let detail: string | null = null;
  if (session?.user?.organizationId && Number.isInteger(num) && num > 0) {
    const l = await tenantDb(session.user.organizationId).listing.findUnique({ where: { id: num }, select: { id: true, buildingName: true, community: true, createdById: true, visibility: true } });
    if (l && canViewListing(l, session.user.id, can(session.user, "listings.viewAll"))) detail = [listingCode(l.id), l.buildingName || l.community].filter(Boolean).join(" · ");
  }
  return pageTitle("Property", detail);
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

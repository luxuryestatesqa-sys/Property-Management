import { prisma } from "./prisma";

// Models that carry their own organizationId column.
const DIRECT = new Set(["User", "Listing", "PortalCredential", "Lead", "LeadStage", "LeadActivity", "AssignmentRule"]);
// Models that belong to a listing, so they belong to that listing's agency.
const VIA_LISTING = new Set(["ListingImage", "AuditLog", "PortalListing"]);

const SCOPED_READ_WRITE = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

type AnyArgs = { where?: Record<string, unknown>; data?: unknown; create?: unknown } & Record<string, unknown>;

function andWhere(where: Record<string, unknown> | undefined, scope: Record<string, unknown>) {
  if (!where) return scope;
  const existing = where.AND;
  const rest = existing === undefined ? [] : Array.isArray(existing) ? existing : [existing];
  return { ...where, AND: [scope, ...rest] };
}

function withOrg<T>(data: T, organizationId: string): T {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const row = data as Record<string, unknown>;
    if (row.organizationId !== undefined && row.organizationId !== organizationId) {
      throw new Error("Cross-organization write blocked");
    }
    // Prisma's create input is either "unchecked" (scalar organizationId) or
    // "checked" (an `organization: { connect }` relation) - setting the scalar
    // alongside a relation would be rejected, so only fill the scalar when no
    // relation to the organization was given.
    if (row.organization !== undefined) return data;
    return { ...row, organizationId } as T;
  }
  return data;
}

/**
 * A Prisma client locked to one agency. Every read, update and delete on
 * agency-owned data is filtered by `organizationId`, and every create is
 * stamped with it - so a route that forgets a filter still cannot leak or
 * touch another agency's rows. Obtain one from `requireSession()`.
 *
 * Child tables (images, audit logs, portal state) are scoped through their
 * listing. Nested writes inside a create/update are not rewritten: build them
 * under a listing you already loaded through this client.
 */
export function tenantDb(organizationId: string) {
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const a = (args ?? {}) as AnyArgs;

          if (DIRECT.has(model) || VIA_LISTING.has(model)) {
            if (SCOPED_READ_WRITE.has(operation)) {
              const scope = DIRECT.has(model) ? { organizationId } : { listing: { organizationId } };
              a.where = andWhere(a.where, scope);
            }
          }

          // A child row (image, audit entry, portal state) may only be created on a
          // listing that belongs to this agency.
          if (VIA_LISTING.has(model) && (operation === "create" || operation === "createMany" || operation === "createManyAndReturn" || operation === "upsert")) {
            const payloads = operation === "upsert" ? [a.create] : Array.isArray(a.data) ? a.data : [a.data];
            const ids = new Set<number>();
            for (const row of payloads) {
              const listingId = (row as { listingId?: unknown } | undefined)?.listingId;
              if (typeof listingId === "number") ids.add(listingId);
            }
            if (ids.size > 0) {
              const owned = await prisma.listing.count({ where: { id: { in: [...ids] }, organizationId } });
              if (owned !== ids.size) throw new Error("Cross-organization write blocked");
            }
          }

          if (DIRECT.has(model)) {
            if (operation === "create") a.data = withOrg(a.data, organizationId);
            else if (operation === "createMany" || operation === "createManyAndReturn") {
              const d = a.data;
              a.data = Array.isArray(d) ? d.map((r) => withOrg(r, organizationId)) : withOrg(d, organizationId);
            } else if (operation === "upsert") a.create = withOrg(a.create, organizationId);
          }

          return query(a);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;

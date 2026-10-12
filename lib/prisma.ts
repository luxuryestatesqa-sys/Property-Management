import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// On Firebase App Hosting the database is reached through the Cloud SQL connector:
// the app's service account (role "Cloud SQL Client") opens an encrypted tunnel to
// the instance, so the database needs no public IP allow-list. Set
// CLOUD_SQL_INSTANCE=<project>:<region>:<instance> plus DB_USER, DB_PASSWORD and
// DB_NAME. Everywhere else (local dev, Vercel, tests) DATABASE_URL is used as before.
async function createClient(): Promise<PrismaClient> {
  const instance = process.env.CLOUD_SQL_INSTANCE;
  if (!instance) return new PrismaClient();

  const [{ Connector, IpAddressTypes }, { Pool }, { PrismaPg }] = await Promise.all([
    import("@google-cloud/cloud-sql-connector"),
    import("pg"),
    import("@prisma/adapter-pg"),
  ]);
  const connector = new Connector();
  const options = await connector.getOptions({ instanceConnectionName: instance, ipType: IpAddressTypes.PUBLIC });
  // Each running copy of the app keeps a few connections; keep (max instances x this) under the
  // database's connection limit.
  const pool = new Pool({
    ...options,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? "crm",
    max: Number(process.env.DB_POOL_MAX ?? 5),
  });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export const prisma = globalForPrisma.prisma ?? (await createClient());

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

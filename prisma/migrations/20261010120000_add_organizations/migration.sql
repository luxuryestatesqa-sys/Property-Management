-- Multi-agency foundation. Everything that exists today becomes the first
-- organization ("Luxury Estates"); nothing is deleted or rewritten, columns are
-- added nullable, backfilled, then made required.

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterEnum (new roles; existing ADMIN/AGENT accounts keep their role)
ALTER TYPE "Role" ADD VALUE 'OWNER';
ALTER TYPE "Role" ADD VALUE 'MANAGER';

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "brandColor" TEXT,
    "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- The agency that already uses this database.
INSERT INTO "Organization" ("id", "name", "slug", "brandColor")
VALUES ('org_luxury_estates', 'Luxury Estates', 'luxury-estates', '#8a6d1f');

-- AlterTable: add as nullable first
ALTER TABLE "User" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Listing" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "PortalCredential" ADD COLUMN "organizationId" TEXT;

-- Backfill every existing row into that agency
UPDATE "User" SET "organizationId" = 'org_luxury_estates';
UPDATE "Listing" SET "organizationId" = 'org_luxury_estates';
UPDATE "PortalCredential" SET "organizationId" = 'org_luxury_estates';

-- Now required
ALTER TABLE "User" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Listing" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "PortalCredential" ALTER COLUMN "organizationId" SET NOT NULL;

-- Transition safety: until the new app version is deployed, the currently running
-- code does not know about organizations and inserts rows without one. A default
-- (the one existing agency) keeps that old code working during the short window
-- between running this migration and deploying. The new code always sets
-- organizationId explicitly. Remove the defaults afterwards with
-- prisma/manual/drop_organization_defaults.sql.
ALTER TABLE "User" ALTER COLUMN "organizationId" SET DEFAULT 'org_luxury_estates';
ALTER TABLE "Listing" ALTER COLUMN "organizationId" SET DEFAULT 'org_luxury_estates';
ALTER TABLE "PortalCredential" ALTER COLUMN "organizationId" SET DEFAULT 'org_luxury_estates';

-- DropIndex: a portal credential is now unique per (agency, portal), not per portal
DROP INDEX "PortalCredential_portal_key";

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX "Listing_organizationId_status_idx" ON "Listing"("organizationId", "status");
CREATE INDEX "Listing_organizationId_dupKey_idx" ON "Listing"("organizationId", "dupKey");
CREATE UNIQUE INDEX "PortalCredential_organizationId_portal_key" ON "PortalCredential"("organizationId", "portal");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PortalCredential" ADD CONSTRAINT "PortalCredential_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

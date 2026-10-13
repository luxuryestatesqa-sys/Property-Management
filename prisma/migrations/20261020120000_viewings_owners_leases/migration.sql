-- Contact follow-up window (hours) per agency
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "contactSlaHours" INTEGER NOT NULL DEFAULT 2;

-- Owners / landlords
CREATE TABLE IF NOT EXISTS "Owner" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "whatsapp" TEXT,
  "email" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Owner_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Owner_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Owner_organizationId_name_idx" ON "Owner"("organizationId", "name");

-- Listing -> owner and lease end
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "leaseEndDate" TIMESTAMP(3);
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Listing_leaseEndDate_idx" ON "Listing"("leaseEndDate");

-- Viewings
DO $$ BEGIN
  CREATE TYPE "ViewingStatus" AS ENUM ('SCHEDULED', 'DONE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "Viewing" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "listingId" INTEGER,
  "agentId" TEXT,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "status" "ViewingStatus" NOT NULL DEFAULT 'SCHEDULED',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Viewing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Viewing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Viewing_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Viewing_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Viewing_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Viewing_organizationId_scheduledAt_idx" ON "Viewing"("organizationId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "Viewing_leadId_idx" ON "Viewing"("leadId");
CREATE INDEX IF NOT EXISTS "Viewing_listingId_idx" ON "Viewing"("listingId");
CREATE INDEX IF NOT EXISTS "Viewing_agentId_scheduledAt_idx" ON "Viewing"("agentId", "scheduledAt");

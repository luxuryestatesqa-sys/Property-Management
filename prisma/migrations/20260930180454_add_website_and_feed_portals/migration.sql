-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Portal" ADD VALUE 'WEBSITE';
ALTER TYPE "Portal" ADD VALUE 'QATAR_LIVING';
ALTER TYPE "Portal" ADD VALUE 'PROPERTY_ORYX';

-- AlterTable
ALTER TABLE "PortalCredential" ADD COLUMN     "feedAgencyId" TEXT,
ADD COLUMN     "feedToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PortalCredential_feedToken_key" ON "PortalCredential"("feedToken");


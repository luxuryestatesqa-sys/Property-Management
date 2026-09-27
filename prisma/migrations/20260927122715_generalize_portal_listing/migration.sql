/*
  Warnings:

  - You are about to drop the `PropertyFinderListing` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PropertyFinderListing" DROP CONSTRAINT "PropertyFinderListing_listingId_fkey";

-- DropTable
DROP TABLE "PropertyFinderListing";

-- CreateTable
CREATE TABLE "PortalListing" (
    "id" TEXT NOT NULL,
    "listingId" INTEGER NOT NULL,
    "portal" "Portal" NOT NULL,
    "remoteListingId" TEXT,
    "state" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "assignedProfileId" INTEGER,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalListing_remoteListingId_idx" ON "PortalListing"("remoteListingId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalListing_listingId_portal_key" ON "PortalListing"("listingId", "portal");

-- AddForeignKey
ALTER TABLE "PortalListing" ADD CONSTRAINT "PortalListing_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

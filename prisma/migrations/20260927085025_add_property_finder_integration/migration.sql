-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bathrooms" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "pfLocationId" INTEGER,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pfPublicProfileId" INTEGER;

-- CreateTable
CREATE TABLE "PropertyFinderListing" (
    "id" TEXT NOT NULL,
    "listingId" INTEGER NOT NULL,
    "pfListingId" TEXT,
    "state" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyFinderListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyFinderListing_listingId_key" ON "PropertyFinderListing"("listingId");

-- CreateIndex
CREATE INDEX "PropertyFinderListing_pfListingId_idx" ON "PropertyFinderListing"("pfListingId");

-- AddForeignKey
ALTER TABLE "PropertyFinderListing" ADD CONSTRAINT "PropertyFinderListing_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

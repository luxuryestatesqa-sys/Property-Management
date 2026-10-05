-- CreateEnum
CREATE TYPE "ListingVisibility" AS ENUM ('PRIVATE', 'SHARED');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "visibility" "ListingVisibility" NOT NULL DEFAULT 'SHARED';

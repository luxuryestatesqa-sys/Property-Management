-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'AGENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('RENT', 'SALE');

-- CreateEnum
CREATE TYPE "Furnished" AS ENUM ('FURNISHED', 'UNFURNISHED');

-- CreateEnum
CREATE TYPE "BillsStatus" AS ENUM ('INCLUDED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'RENTED', 'SOLD');

-- CreateEnum
CREATE TYPE "PropertyCategory" AS ENUM ('APARTMENT', 'VILLA', 'TOWNHOUSE', 'PENTHOUSE', 'DUPLEX', 'COMPOUND_VILLA', 'WHOLE_BUILDING', 'OFFICE', 'RETAIL', 'LAND');

-- CreateEnum
CREATE TYPE "BedroomCount" AS ENUM ('STUDIO', 'ONE', 'TWO', 'TWO_PLUS_MAID', 'THREE', 'THREE_PLUS_MAID', 'FOUR', 'FOUR_PLUS_MAID', 'FIVE', 'FIVE_PLUS_MAID', 'SIX_PLUS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'AGENT',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" SERIAL NOT NULL,
    "listingType" "ListingType" NOT NULL,
    "propertyCategory" "PropertyCategory" NOT NULL,
    "bedrooms" "BedroomCount",
    "sizeSqm" DOUBLE PRECISION,
    "area" TEXT NOT NULL,
    "community" TEXT NOT NULL,
    "buildingName" TEXT NOT NULL,
    "floor" TEXT NOT NULL,
    "apartmentNumber" TEXT NOT NULL,
    "dupKey" TEXT NOT NULL,
    "rentPrice" DOUBLE PRECISION,
    "salePrice" DOUBLE PRECISION,
    "rentalValue" DOUBLE PRECISION,
    "furnished" "Furnished" NOT NULL,
    "billsStatus" "BillsStatus" NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "deactivatedAt" TIMESTAMP(3),
    "availabilityStatus" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingImage" (
    "id" TEXT NOT NULL,
    "listingId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "listingId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Listing_area_idx" ON "Listing"("area");

-- CreateIndex
CREATE INDEX "Listing_community_idx" ON "Listing"("community");

-- CreateIndex
CREATE INDEX "Listing_buildingName_idx" ON "Listing"("buildingName");

-- CreateIndex
CREATE INDEX "Listing_apartmentNumber_idx" ON "Listing"("apartmentNumber");

-- CreateIndex
CREATE INDEX "Listing_floor_idx" ON "Listing"("floor");

-- CreateIndex
CREATE INDEX "Listing_listingType_idx" ON "Listing"("listingType");

-- CreateIndex
CREATE INDEX "Listing_rentPrice_idx" ON "Listing"("rentPrice");

-- CreateIndex
CREATE INDEX "Listing_salePrice_idx" ON "Listing"("salePrice");

-- CreateIndex
CREATE INDEX "Listing_status_idx" ON "Listing"("status");

-- CreateIndex
CREATE INDEX "Listing_createdById_idx" ON "Listing"("createdById");

-- CreateIndex
CREATE INDEX "Listing_dupKey_idx" ON "Listing"("dupKey");

-- CreateIndex
CREATE INDEX "Listing_availabilityStatus_idx" ON "Listing"("availabilityStatus");

-- CreateIndex
CREATE INDEX "Listing_propertyCategory_idx" ON "Listing"("propertyCategory");

-- CreateIndex
CREATE INDEX "Listing_bedrooms_idx" ON "Listing"("bedrooms");

-- CreateIndex
CREATE INDEX "ListingImage_listingId_idx" ON "ListingImage"("listingId");

-- CreateIndex
CREATE INDEX "AuditLog_listingId_idx" ON "AuditLog"("listingId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingImage" ADD CONSTRAINT "ListingImage_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "Portal" AS ENUM ('PROPERTY_FINDER');

-- CreateTable
CREATE TABLE "PortalCredential" (
    "id" TEXT NOT NULL,
    "portal" "Portal" NOT NULL,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "webhookSecret" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalCredential_portal_key" ON "PortalCredential"("portal");

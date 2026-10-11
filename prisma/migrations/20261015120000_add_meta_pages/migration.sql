-- AlterEnum
ALTER TYPE "LeadChannel" ADD VALUE 'FORM';

-- CreateTable
CREATE TABLE "MetaPage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "fbUserId" TEXT,
    "connectedById" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLeadAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaPage_pageId_key" ON "MetaPage"("pageId");

-- CreateIndex
CREATE INDEX "MetaPage_organizationId_idx" ON "MetaPage"("organizationId");

-- CreateIndex
CREATE INDEX "MetaPage_fbUserId_idx" ON "MetaPage"("fbUserId");

-- AddForeignKey
ALTER TABLE "MetaPage" ADD CONSTRAINT "MetaPage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

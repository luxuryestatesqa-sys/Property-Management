-- CreateTable
CREATE TABLE "LeadTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "text" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadGroupLink" (
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "LeadGroupLink_pkey" PRIMARY KEY ("leadId","groupId")
);

-- CreateIndex
CREATE INDEX "LeadTask_organizationId_doneAt_dueAt_idx" ON "LeadTask"("organizationId", "doneAt", "dueAt");

-- CreateIndex
CREATE INDEX "LeadTask_leadId_idx" ON "LeadTask"("leadId");

-- CreateIndex
CREATE INDEX "LeadTask_assignedToId_doneAt_idx" ON "LeadTask"("assignedToId", "doneAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadGroup_organizationId_name_key" ON "LeadGroup"("organizationId", "name");

-- CreateIndex
CREATE INDEX "LeadGroupLink_groupId_idx" ON "LeadGroupLink"("groupId");

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadGroup" ADD CONSTRAINT "LeadGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadGroupLink" ADD CONSTRAINT "LeadGroupLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadGroupLink" ADD CONSTRAINT "LeadGroupLink_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadGroupLink" ADD CONSTRAINT "LeadGroupLink_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LeadGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;


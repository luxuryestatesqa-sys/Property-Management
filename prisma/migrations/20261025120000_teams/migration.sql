-- Teams: a group inside an agency with a manager who sees only that team's people and work.
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "teamId" TEXT;

CREATE UNIQUE INDEX "Team_organizationId_name_key" ON "Team"("organizationId", "name");
CREATE INDEX "Team_organizationId_idx" ON "Team"("organizationId");
CREATE INDEX "Team_managerId_idx" ON "Team"("managerId");
CREATE INDEX "User_teamId_idx" ON "User"("teamId");

ALTER TABLE "Team" ADD CONSTRAINT "Team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

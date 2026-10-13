-- The Properties list sorts by newest first within an agency and status.
CREATE INDEX IF NOT EXISTS "Listing_createdAt_idx" ON "Listing"("createdAt");
CREATE INDEX IF NOT EXISTS "Listing_organizationId_status_createdAt_idx" ON "Listing"("organizationId", "status", "createdAt");

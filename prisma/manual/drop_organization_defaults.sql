-- Run ONCE, after the multi-agency app version is deployed and live.
-- It removes the transition defaults added by 20261010120000_add_organizations so
-- that every new row must carry an explicit organizationId.
ALTER TABLE "User" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "Listing" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "PortalCredential" ALTER COLUMN "organizationId" DROP DEFAULT;

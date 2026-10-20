-- Configurable permissions: per person (null = follow the agency's template for their role) and per agency.
ALTER TABLE "User" ADD COLUMN "permissions" JSONB;
ALTER TABLE "Organization" ADD COLUMN "rolePermissions" JSONB;

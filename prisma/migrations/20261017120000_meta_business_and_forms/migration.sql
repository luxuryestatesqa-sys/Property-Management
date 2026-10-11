-- AlterTable
ALTER TABLE "MetaPage" ADD COLUMN     "businessId" TEXT,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "disabledForms" TEXT[] DEFAULT ARRAY[]::TEXT[];

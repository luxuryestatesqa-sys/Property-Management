-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('RESALE_READY', 'RESALE_OFF_PLAN', 'PRIMARY_READY', 'PRIMARY_OFF_PLAN');

-- CreateEnum
CREATE TYPE "SalePaymentMethod" AS ENUM ('CASH', 'INSTALLMENTS', 'CASH_AND_INSTALLMENTS');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "downPayment" INTEGER,
ADD COLUMN     "mortgageYears" INTEGER,
ADD COLUMN     "paymentMethods" "SalePaymentMethod",
ADD COLUMN     "projectStatus" "ProjectStatus";

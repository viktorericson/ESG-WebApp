-- CreateEnum
CREATE TYPE "ReportModule" AS ENUM ('BASIC', 'BASIC_AND_COMPREHENSIVE');

-- CreateEnum
CREATE TYPE "ReportBasis" AS ENUM ('INDIVIDUAL', 'CONSOLIDATED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED');

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "operationalFrom" TIMESTAMP(3),
ADD COLUMN     "operationalTo" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "standardVersion" TEXT NOT NULL DEFAULT 'VS (EU-Kommissionens henstilling 2025)',
    "module" "ReportModule" NOT NULL DEFAULT 'BASIC',
    "basis" "ReportBasis" NOT NULL DEFAULT 'CONSOLIDATED',
    "reportingCompanyId" TEXT NOT NULL,
    "omissions" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCompany" (
    "reportId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "ReportCompany_pkey" PRIMARY KEY ("reportId","companyId")
);

-- CreateIndex
CREATE INDEX "Report_periodId_idx" ON "Report"("periodId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ReportingPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportingCompanyId_fkey" FOREIGN KEY ("reportingCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCompany" ADD CONSTRAINT "ReportCompany_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCompany" ADD CONSTRAINT "ReportCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

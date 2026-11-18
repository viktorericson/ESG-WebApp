-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "licenseCheckedAt" TIMESTAMP(3),
ADD COLUMN     "licenseError" TEXT,
ADD COLUMN     "licenseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "licenseKey" TEXT,
ADD COLUMN     "licenseLimit" INTEGER,
ADD COLUMN     "licenseLimitType" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_licenseKey_key" ON "Organization"("licenseKey");


-- DropIndex
DROP INDEX "Organization_licenseKey_key";

-- CreateIndex
CREATE INDEX "Organization_licenseKey_idx" ON "Organization"("licenseKey");

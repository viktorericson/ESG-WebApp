-- CreateEnum
CREATE TYPE "ModuleStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NOT_RELEVANT');

-- CreateTable
CREATE TABLE "ModuleData" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "status" "ModuleStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "statusNote" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "moduleDataId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModuleData_companyId_periodId_idx" ON "ModuleData"("companyId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleData_periodId_moduleKey_targetKey_key" ON "ModuleData"("periodId", "moduleKey", "targetKey");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_moduleDataId_idx" ON "Attachment"("moduleDataId");

-- AddForeignKey
ALTER TABLE "ModuleData" ADD CONSTRAINT "ModuleData_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ReportingPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleData" ADD CONSTRAINT "ModuleData_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleData" ADD CONSTRAINT "ModuleData_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleData" ADD CONSTRAINT "ModuleData_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_moduleDataId_fkey" FOREIGN KEY ("moduleDataId") REFERENCES "ModuleData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

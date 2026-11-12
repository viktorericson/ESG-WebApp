-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "brandColor" TEXT,
ADD COLUMN     "coverContentType" TEXT,
ADD COLUMN     "coverKey" TEXT,
ADD COLUMN     "coverUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "content" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "ReportImage" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "caption" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportImage_storageKey_key" ON "ReportImage"("storageKey");

-- CreateIndex
CREATE INDEX "ReportImage_reportId_slot_idx" ON "ReportImage"("reportId", "slot");

-- AddForeignKey
ALTER TABLE "ReportImage" ADD CONSTRAINT "ReportImage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ReportingPeriod" ADD COLUMN     "factorSetId" TEXT;

-- CreateTable
CREATE TABLE "FactorSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "sourceUrl" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT,
    "basedOnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactorSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissionFactor" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "mainCategory" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "parameter1" TEXT,
    "parameter2" TEXT,
    "unit" TEXT NOT NULL,
    "scope1" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scope2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scope3" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outsideScopes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT,
    "customized" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EmissionFactor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FactorSet_organizationId_idx" ON "FactorSet"("organizationId");

-- CreateIndex
CREATE INDEX "EmissionFactor_setId_year_category_idx" ON "EmissionFactor"("setId", "year", "category");

-- CreateIndex
CREATE UNIQUE INDEX "EmissionFactor_setId_year_key_key" ON "EmissionFactor"("setId", "year", "key");

-- AddForeignKey
ALTER TABLE "ReportingPeriod" ADD CONSTRAINT "ReportingPeriod_factorSetId_fkey" FOREIGN KEY ("factorSetId") REFERENCES "FactorSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactorSet" ADD CONSTRAINT "FactorSet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactorSet" ADD CONSTRAINT "FactorSet_basedOnId_fkey" FOREIGN KEY ("basedOnId") REFERENCES "FactorSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionFactor" ADD CONSTRAINT "EmissionFactor_setId_fkey" FOREIGN KEY ("setId") REFERENCES "FactorSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

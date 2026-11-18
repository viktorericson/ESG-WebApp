-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "impersonatorId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "platformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_impersonatorId_fkey" FOREIGN KEY ("impersonatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

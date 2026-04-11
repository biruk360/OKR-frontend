-- AlterTable
ALTER TABLE "objectives" ADD COLUMN "alignmentType" TEXT NOT NULL DEFAULT 'LOOSE';
ALTER TABLE "objectives" ADD COLUMN "rollupCalculation" TEXT NOT NULL DEFAULT 'NONE';

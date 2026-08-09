-- AlterTable
-- Make incidentDate required. Some environments already have the column
-- (created via `prisma db push`), so guard the ADD COLUMN and backfill any
-- nulls before applying NOT NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'report' AND column_name = 'incidentDate'
  ) THEN
    ALTER TABLE "report" ADD COLUMN "incidentDate" TIMESTAMP(3);
  END IF;
END $$;

UPDATE "report" SET "incidentDate" = "createdAt" WHERE "incidentDate" IS NULL;
ALTER TABLE "report" ALTER COLUMN "incidentDate" SET NOT NULL;

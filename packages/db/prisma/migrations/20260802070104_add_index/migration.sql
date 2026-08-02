/*
  Warnings:

  - A unique constraint covering the columns `[geohash]` on the table `risk_score` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX "report_geohash_idx" ON "report"("geohash");

-- CreateIndex
CREATE INDEX "report_createdAt_idx" ON "report"("createdAt");

-- CreateIndex
CREATE INDEX "report_category_idx" ON "report"("category");

-- CreateIndex
CREATE UNIQUE INDEX "risk_score_geohash_key" ON "risk_score"("geohash");

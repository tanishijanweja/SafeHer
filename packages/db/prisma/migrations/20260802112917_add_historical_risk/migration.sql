-- CreateTable
CREATE TABLE "historical_risk" (
    "id" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "geohash" TEXT NOT NULL,
    "crimeCount" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'NCRB',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "historical_risk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historical_risk_geohash_idx" ON "historical_risk"("geohash");

-- CreateIndex
CREATE INDEX "historical_risk_district_idx" ON "historical_risk"("district");

-- CreateTable
CREATE TABLE "news_incident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geohash" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_incident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_incident_url_key" ON "news_incident"("url");

-- CreateIndex
CREATE INDEX "news_incident_geohash_idx" ON "news_incident"("geohash");

-- CreateIndex
CREATE INDEX "news_incident_publishedAt_idx" ON "news_incident"("publishedAt");

import type { PrismaClient } from "../prisma/generated/client";

import ngeohash from "ngeohash";

import {
  type HeatmapNewsRow,
  HEATMAP_NEWS_RADIUS_KM,
  MIN_NEWS_PREFIX_LEN,
  NEWS_WINDOW_DAYS,
  commonPrefixLen,
  distanceKm,
  newsScoreFromRows,
  selectHeatmapNews,
} from "./news-scoring";

const LIVE_WINDOW_DAYS = 30;

function liveRecencyWeight(createdAt: Date, now: Date): number {
  const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > LIVE_WINDOW_DAYS) return 0;
  if (ageDays <= 1) return 1.0;
  if (ageDays <= 7) return 0.8;
  if (ageDays <= 14) return 0.5;
  return 0.25;
}

/** News score in [0,1] from heatmap-eligible incidents only */
export async function computeNewsScore(
  prisma: PrismaClient,
  geohash: string,
  cached?: HeatmapNewsRow[],
): Promise<number> {
  const now = new Date();

  let rows = cached;
  if (!rows) {
    const cutoff = new Date(now.getTime() - NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    rows = await prisma.newsIncident.findMany({
      where: {
        publishedAt: { gte: cutoff },
        affectsHeatmap: true,
      },
      select: {
        geohash: true,
        latitude: true,
        longitude: true,
        publishedAt: true,
        severity: true,
        confidence: true,
        affectsHeatmap: true,
        localityName: true,
        dedupeKey: true,
        url: true,
        sourceDomain: true,
      },
    });
  }

  return newsScoreFromRows(selectHeatmapNews(geohash, rows, now), now);
}

export async function computeHistoricalScore(
  prisma: PrismaClient,
  geohash: string,
): Promise<number> {
  const rows = await prisma.historicalRisk.findMany({
    select: { geohash: true, score: true },
  });

  let bestScore = 0;
  let bestPrefixLen = 0;

  for (const row of rows) {
    const prefixLen = commonPrefixLen(geohash, row.geohash);
    if (prefixLen >= MIN_NEWS_PREFIX_LEN && prefixLen > bestPrefixLen) {
      bestPrefixLen = prefixLen;
      bestScore = row.score;
    }
  }
  return bestScore;
}

export async function computeLiveScore(
  prisma: PrismaClient,
  geohash: string,
): Promise<{ score: number; count: number }> {
  const cutoff = new Date(Date.now() - LIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const reports = await prisma.report.findMany({
    where: {
      geohash,
      isSpam: false,
      createdAt: { gte: cutoff },
    },
    select: { severity: true, createdAt: true },
  });

  if (reports.length === 0) return { score: 0, count: 0 };

  const now = new Date();
  let weighted = 0;
  let wSum = 0;

  for (const r of reports) {
    const w = liveRecencyWeight(r.createdAt, now);
    if (w <= 0) continue;
    weighted += (r.severity / 5) * w;
    wSum += w;
  }

  if (wSum === 0) return { score: 0, count: reports.length };
  return { score: Math.min(weighted / wSum, 1.0), count: reports.length };
}

export function combineScores(historical: number, live: number, news: number): number {
  return 0.4 * historical + 0.35 * live + 0.25 * news;
}

export async function refreshRiskScoreForGeohash(
  prisma: PrismaClient,
  geohash: string,
  newsCache?: HeatmapNewsRow[],
) {
  const [historicalScore, newsScore, live] = await Promise.all([
    computeHistoricalScore(prisma, geohash),
    computeNewsScore(prisma, geohash, newsCache),
    computeLiveScore(prisma, geohash),
  ]);

  const combinedScore = combineScores(historicalScore, live.score, newsScore);

  return prisma.riskScore.upsert({
    where: { geohash },
    create: {
      geohash,
      historicalScore,
      liveScore: live.score,
      combinedScore,
      incidentCount: live.count,
      lastUpdated: new Date(),
    },
    update: {
      historicalScore,
      liveScore: live.score,
      combinedScore,
      incidentCount: live.count,
      lastUpdated: new Date(),
    },
  });
}

export async function recomputeRiskForGeohashes(
  prisma: PrismaClient,
  geohashes: Iterable<string>,
): Promise<number> {
  const unique = [...new Set(geohashes)].filter(Boolean);
  if (unique.length === 0) return 0;

  const cutoff = new Date(Date.now() - NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const newsCache = await prisma.newsIncident.findMany({
    where: { publishedAt: { gte: cutoff }, affectsHeatmap: true },
    select: {
      geohash: true,
      latitude: true,
      longitude: true,
      publishedAt: true,
      severity: true,
      confidence: true,
      affectsHeatmap: true,
      localityName: true,
      dedupeKey: true,
      url: true,
      sourceDomain: true,
    },
  });

  // A news incident at geohash N can affect EVERY cell whose centre lies within
  // HEATMAP_NEWS_RADIUS_KM of N (the selector's hard geo bound). The popup shows
  // the same incidents, so refresh all of them or adjacent cells would display
  // news their stale score never counted.
  const targets = new Set(unique);
  if (newsCache.length > 0) {
    const touchedCentres = [...unique].map((gh) => ngeohash.decode(gh));
    const cells = await prisma.riskScore.findMany({ select: { geohash: true } });
    for (const cell of cells) {
      const cc = ngeohash.decode(cell.geohash);
      for (const tc of touchedCentres) {
        if (
          distanceKm(cc.latitude, cc.longitude, tc.latitude, tc.longitude) <=
          HEATMAP_NEWS_RADIUS_KM
        ) {
          targets.add(cell.geohash);
          break;
        }
      }
    }
  }

  let n = 0;
  for (const gh of targets) {
    await refreshRiskScoreForGeohash(prisma, gh, newsCache);
    n++;
  }
  return n;
}

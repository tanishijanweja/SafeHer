import type { PrismaClient } from "../prisma/generated/client";

import {
  MIN_NEWS_PREFIX_LEN,
  NEWS_WINDOW_DAYS,
  newsRecencyWeight,
  normalizeNewsScore,
} from "./news-scoring";

const LIVE_WINDOW_DAYS = 30;

function commonPrefixLen(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  for (; i < limit; i++) {
    if (a[i] !== b[i]) break;
  }
  return i;
}

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
  cached?: Array<{
    geohash: string;
    publishedAt: Date;
    severity: number;
    confidence: number;
    affectsHeatmap: boolean;
  }>,
): Promise<number> {
  const now = Date.now();
  const nowDate = new Date(now);

  let rows = cached;
  if (!rows) {
    const cutoff = new Date(now - NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    rows = await prisma.newsIncident.findMany({
      where: {
        publishedAt: { gte: cutoff },
        affectsHeatmap: true,
      },
      select: {
        geohash: true,
        publishedAt: true,
        severity: true,
        confidence: true,
        affectsHeatmap: true,
      },
    });
  }

  let bestScore = 0;
  let bestPrefixLen = 0;

  for (const row of rows) {
    if (!row.affectsHeatmap) continue;
    const prefixLen = commonPrefixLen(geohash, row.geohash);
    if (prefixLen < MIN_NEWS_PREFIX_LEN) continue;

    const rw = newsRecencyWeight(row.publishedAt, nowDate);
    if (rw <= 0) continue;

    const sev = Math.min(Math.max(row.severity || 3, 1), 5) / 5;
    const conf = Math.min(Math.max(row.confidence || 0.5, 0), 1);
    const weight = rw * sev * conf;

    if (prefixLen > bestPrefixLen) {
      bestPrefixLen = prefixLen;
      bestScore = 0;
    }
    if (prefixLen === bestPrefixLen) {
      bestScore += weight;
    }
  }

  return normalizeNewsScore(bestScore);
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
  newsCache?: Array<{
    geohash: string;
    publishedAt: Date;
    severity: number;
    confidence: number;
    affectsHeatmap: boolean;
  }>,
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
      publishedAt: true,
      severity: true,
      confidence: true,
      affectsHeatmap: true,
    },
  });

  let n = 0;
  for (const gh of unique) {
    await refreshRiskScoreForGeohash(prisma, gh, newsCache);
    n++;
  }
  return n;
}

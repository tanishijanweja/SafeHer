import prisma from "@safe-her/db";

import { getNewsDerivedScore } from "./news-risk";

const LIVE_WINDOW_DAYS = 30;
const MIN_PREFIX_LEN = 4;

export async function getReportsByGeohash(geohash: string) {
  const cutoff = new Date(Date.now() - LIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return prisma.report.findMany({
    where: {
      geohash,
      isSpam: false,
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: "desc" },
  });
}

export type Report = Awaited<ReturnType<typeof getReportsByGeohash>>[number];

type CachedRow = { geohash: string; score: number };

let cachedHistorical: CachedRow[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function liveRecencyWeight(createdAt: Date, now: Date): number {
  const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > LIVE_WINDOW_DAYS) return 0;
  if (ageDays <= 1) return 1.0;
  if (ageDays <= 7) return 0.8;
  if (ageDays <= 14) return 0.5;
  return 0.25;
}

export async function getHistoricalScore(geohash: string): Promise<number> {
  const now = Date.now();

  if (!cachedHistorical || now - cacheTimestamp > CACHE_TTL_MS) {
    cachedHistorical = await prisma.historicalRisk.findMany({
      select: { geohash: true, score: true },
    });
    cacheTimestamp = now;
  }

  let bestScore = 0;
  let bestPrefixLen = 0;

  for (const row of cachedHistorical) {
    let prefixLen = 0;
    const limit = Math.min(geohash.length, row.geohash.length);
    for (let i = 0; i < limit; i++) {
      if (geohash[i] === row.geohash[i]) prefixLen++;
      else break;
    }
    if (prefixLen >= MIN_PREFIX_LEN && prefixLen > bestPrefixLen) {
      bestPrefixLen = prefixLen;
      bestScore = row.score;
    }
  }

  return bestScore;
}

/** Live score in [0, 1]: recency-weighted mean of severity/5 */
export function calculateLiveScore(reports: Report[]): number {
  if (reports.length === 0) return 0;

  const now = new Date();
  let weighted = 0;
  let wSum = 0;

  for (const report of reports) {
    const w = liveRecencyWeight(report.createdAt, now);
    if (w <= 0) continue;
    weighted += (report.severity / 5) * w;
    wSum += w;
  }

  if (wSum === 0) return 0;
  return Math.min(weighted / wSum, 1.0);
}

/** All inputs must be in [0, 1] */
export function calculateCombinedScore(
  historicalScore: number,
  liveScore: number,
  newsScore: number,
): number {
  return 0.4 * historicalScore + 0.35 * liveScore + 0.25 * newsScore;
}

export async function refreshRiskScore(geohash: string) {
  const reports = await getReportsByGeohash(geohash);

  const historicalScore = await getHistoricalScore(geohash);
  const newsScore = await getNewsDerivedScore(geohash);
  const liveScore = calculateLiveScore(reports);
  const combinedScore = calculateCombinedScore(historicalScore, liveScore, newsScore);

  return prisma.riskScore.upsert({
    where: { geohash },
    create: {
      geohash,
      historicalScore,
      liveScore,
      combinedScore,
      incidentCount: reports.length,
      lastUpdated: new Date(),
    },
    update: {
      historicalScore,
      liveScore,
      combinedScore,
      incidentCount: reports.length,
      lastUpdated: new Date(),
    },
  });
}

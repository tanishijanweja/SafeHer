import prisma from "@safe-her/db";

export async function getReportsByGeohash(geohash: string) {
  return prisma.report.findMany({
    where: { geohash },
    orderBy: { createdAt: "desc" },
  });
}

export type Report = Awaited<ReturnType<typeof getReportsByGeohash>>[number];

type CachedRow = { geohash: string; score: number };

let cachedHistorical: CachedRow[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getHistoricalScore(geohash: string): Promise<number> {
  const now = Date.now();

  if (!cachedHistorical || now - cacheTimestamp > CACHE_TTL_MS) {
    cachedHistorical = await prisma.historicalRisk.findMany({
      select: { geohash: true, score: true },
    });
    cacheTimestamp = now;
  }

  const MIN_PREFIX_LEN = 3;
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

export function calculateLiveScore(reports: Report[]): number {
  if (reports.length === 0) return 0;
  const total = reports.reduce((sum, report) => sum + report.severity, 0);
  return total / reports.length;
}

export function calculateCombinedScore(historicalScore: number, liveScore: number): number {
  return 0.4 * historicalScore + 0.4 * liveScore + 0.2 * 1;
}

export async function refreshRiskScore(geohash: string) {
  const reports = await getReportsByGeohash(geohash);

  const historicalScore = await getHistoricalScore(geohash);
  const liveScore = calculateLiveScore(reports);
  const combinedScore = calculateCombinedScore(historicalScore, liveScore);

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

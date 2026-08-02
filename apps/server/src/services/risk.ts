import prisma from "@safe-her/db";

export async function getReportsByGeohash(geohash: string) {
  return prisma.report.findMany({
    where: { geohash },
    orderBy: { createdAt: "desc" },
  });
}

export type Report = Awaited<ReturnType<typeof getReportsByGeohash>>[number];

export async function getHistoricalScore(_geohash: string): Promise<number> {
  return 0;
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

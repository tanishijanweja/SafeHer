import prisma from "@safe-her/db";
import {
  NEWS_WINDOW_DAYS,
  newsScoreFromRows,
  selectHeatmapNews,
  type HeatmapNewsRow,
} from "@safe-her/db/news-scoring";

let cachedNews: HeatmapNewsRow[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;

export function invalidateNewsCache(): void {
  cachedNews = null;
  cacheTimestamp = 0;
}

export async function getNewsDerivedScore(geohash: string): Promise<number> {
  const now = Date.now();

  if (!cachedNews || now - cacheTimestamp > CACHE_TTL_MS) {
    const cutoff = new Date(now - NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    cachedNews = await prisma.newsIncident.findMany({
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
    cacheTimestamp = now;
  }

  const rows = selectHeatmapNews(geohash, cachedNews, new Date(now));
  return newsScoreFromRows(rows, new Date(now));
}

export { NEWS_WINDOW_DAYS }; // keep signature imports stable
export { MAX_INCIDENTS_FOR_FULL_SCORE, MIN_NEWS_PREFIX_LEN } from "@safe-her/db/news-scoring";

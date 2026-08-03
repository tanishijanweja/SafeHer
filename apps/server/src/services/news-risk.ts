import prisma from "@safe-her/db";
import {
  MAX_INCIDENTS_FOR_FULL_SCORE,
  MIN_NEWS_PREFIX_LEN,
  NEWS_WINDOW_DAYS,
  newsRecencyWeight,
  normalizeNewsScore,
} from "@safe-her/db/news-scoring";

interface CachedNewsRow {
  geohash: string;
  publishedAt: Date;
  severity: number;
  confidence: number;
}

let cachedNews: CachedNewsRow[] | null = null;
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
        publishedAt: true,
        severity: true,
        confidence: true,
      },
    });
    cacheTimestamp = now;
  }

  if (cachedNews.length === 0) return 0;

  const nowDate = new Date(now);
  let bestScore = 0;
  let bestPrefixLen = 0;

  for (const row of cachedNews) {
    let prefixLen = 0;
    const limit = Math.min(geohash.length, row.geohash.length);
    for (let i = 0; i < limit; i++) {
      if (geohash[i] === row.geohash[i]) prefixLen++;
      else break;
    }
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

export { NEWS_WINDOW_DAYS, MAX_INCIDENTS_FOR_FULL_SCORE, MIN_NEWS_PREFIX_LEN };

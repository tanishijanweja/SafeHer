/** Shared news recency / scoring constants (ingest + server) */

export const NEWS_WINDOW_DAYS = 180;
export const MAX_INCIDENTS_FOR_FULL_SCORE = 12;
export const MIN_NEWS_PREFIX_LEN = 4;

/**
 * Rolling historical window weights:
 * 0–7d → 1.0 | 8–30d → 0.8 | 31–90d → 0.6 | 91–180d → 0.4 | >180d → 0
 */
export function newsRecencyWeight(publishedAt: Date, now: Date = new Date()): number {
  const ageDays = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 0) return 1.0;
  if (ageDays <= 7) return 1.0;
  if (ageDays <= 30) return 0.8;
  if (ageDays <= 90) return 0.6;
  if (ageDays <= NEWS_WINDOW_DAYS) return 0.4;
  return 0;
}

export function normalizeNewsScore(weightedSum: number): number {
  return Math.min(Math.max(weightedSum / MAX_INCIDENTS_FOR_FULL_SCORE, 0), 1.0);
}

/** Shared news recency / scoring constants (ingest + server) */

import ngeohash from "ngeohash";

import { nearestDelhiPlace } from "./delhi-locations";

export const NEWS_WINDOW_DAYS = 180;
export const MAX_INCIDENTS_FOR_FULL_SCORE = 12;
export const MIN_NEWS_PREFIX_LEN = 4;

const geohashAlphabet = "0123456789bcdefghjkmnpqrstuvwxyz";
const geohashAlphabetSet = new Set(geohashAlphabet);

/**
 * True when the string is a plausible raw geohash token (e.g. "ttnf6u"). Only
 * tokens made entirely of the geohash base-32 alphabet are treated as geohashes,
 * so real single-word locality names like "Chhatarpur"/"Dwarka"/"Rohini" (which
 * contain letters outside that alphabet, e.g. 'a') are never mistaken for one.
 */
export function isGeohashToken(s: string): boolean {
  if (s.length < 5 || s.length > 12) return false;
  for (const ch of s.toLowerCase()) {
    if (!geohashAlphabetSet.has(ch)) return false;
  }
  return true;
}

export function commonPrefixLen(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  for (; i < limit; i++) {
    if (a[i] !== b[i]) break;
  }
  return i;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in km (haversine). Used only to choose which cells to
 * recompute after an ingest; NOT used for popup news selection. */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Locality-scale radius used when expanding which cells to recompute after an
 * ingest. Independent of popup news selection. */
export const HEATMAP_NEWS_RADIUS_KM = 3;

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

/**
 * True when a news row is synthetic seed/demo data rather than live GDELT news.
 * Seed rows must never appear as a live "News Article" (no badge, no link); they
 * belong under historical/demo data only.
 */
export function isSeedNews(row: {
  dedupeKey?: string | null;
  url?: string | null;
  sourceDomain?: string | null;
}): boolean {
  if (row.dedupeKey?.startsWith("seed:")) return true;
  if (row.url?.startsWith("seed://")) return true;
  if (row.sourceDomain === "seed.safeher.local") return true;
  return false;
}

/** Fields a news row must expose to be selected for a cell's heatmap risk. */
export type HeatmapNewsRow = {
  geohash: string;
  latitude: number;
  longitude: number;
  publishedAt: Date;
  severity: number;
  confidence: number;
  affectsHeatmap: boolean;
  localityName?: string | null;
  dedupeKey?: string | null;
  url?: string | null;
  sourceDomain?: string | null;
};

/**
 * Resolves the single locality label ("Chhatarpur", "Munirka", ...) that a
 * geohash cell belongs to. Used as the area identity for the popup AND the news
 * score so both agree on which named locality an area is.
 */
export function cellLocality(cellGeohash: string): string {
  const center = ngeohash.decode(cellGeohash);
  return nearestDelhiPlace(center.latitude, center.longitude).name;
}

/**
 * Single source of truth that selects, for a given cell, the exact news
 * incidents that feed the risk score AND that the popup should display.
 *
 * Selection is strictly by the article's OWN locality (its stored
 * `localityName`), not by geohash prefix, distance or nearest-neighbour reuse:
 *   - affectsHeatmap must be true and the article within the news window
 *   - it must not be synthetic seed/demo data
 *   - it must have a concrete localityName
 *   - that localityName must equal the cell's resolved locality (so an article
 *     only ever appears under the locality it actually belongs to).
 *
 * Keeping popup + scoring on this one function guarantees the marker colour and
 * the popup's news list can never disagree about what news affected the cell.
 */
export function selectHeatmapNews<T extends HeatmapNewsRow>(
  cellGeohash: string,
  rows: T[],
  now: Date = new Date(),
): T[] {
  const cutoff = new Date(now.getTime() - NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const cellLoc = cellLocality(cellGeohash);

  const best: T[] = [];

  for (const row of rows) {
    if (!row.affectsHeatmap || row.publishedAt < cutoff) continue;
    if (newsRecencyWeight(row.publishedAt, now) <= 0) continue;
    if (isSeedNews(row)) continue;
    if (!row.localityName || !row.localityName.trim()) continue;
    if (row.localityName.trim() !== cellLoc) continue;

    best.push(row);
  }

  return best;
}

/** [0,1] news contribution derived from the selected incident rows. */
export function newsScoreFromRows(
  rows: HeatmapNewsRow[],
  now: Date = new Date(),
): number {
  let weightedSum = 0;
  for (const row of rows) {
    const rw = newsRecencyWeight(row.publishedAt, now);
    const sev = Math.min(Math.max(row.severity || 3, 1), 5) / 5;
    const conf = Math.min(Math.max(row.confidence || 0.5, 0), 1);
    weightedSum += rw * sev * conf;
  }
  return normalizeNewsScore(weightedSum);
}

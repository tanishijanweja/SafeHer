import { nearestDelhiPlace } from "@safe-her/db/delhi-locations";
import { isGeohashToken } from "@safe-her/db/news-scoring";

const GENERIC_NAMES = new Set([
  "delhi",
  "new delhi",
  "newdelhi",
  "ncr",
  "delhi ncr",
  "india",
  "unknown",
  "nct",
  "national capital territory",
  "national capital territory of delhi",
]);

function isGenericName(name: string | null | undefined): boolean {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  if (!n || n.length < 2) return true;
  if (GENERIC_NAMES.has(n)) return true;
  // Only drop strings that are genuinely raw geohash tokens ("ttnf6u"), so real
  // single-word locality names like "Chhatarpur"/"Dwarka"/"Rohini" are kept.
  if (isGeohashToken(n)) return true;
  if (/^area\s+/i.test(n)) return true;
  return false;
}

export { nearestDelhiPlace };

/**
 * Human-readable area label. Never returns a geohash.
 * Prefer known locality; otherwise "Near <place>" from lat/lng.
 */
export function resolveAreaName(
  lat: number,
  lng: number,
  ...candidates: Array<string | null | undefined>
): string {
  for (const c of candidates) {
    if (!isGenericName(c)) {
      return c!.trim();
    }
  }

  const near = nearestDelhiPlace(lat, lng);
  if (near.km <= 0.5) return near.name;
  if (near.km <= 12) return `Near ${near.name}`;
  return "Delhi NCR";
}

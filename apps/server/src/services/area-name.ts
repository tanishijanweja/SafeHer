import { DELHI_LOCATIONS } from "@safe-her/db/delhi-locations";

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
  // Never surface geohash-like tokens
  if (/^[a-z0-9]{5,12}$/i.test(n) && !n.includes(" ")) return true;
  if (/^area\s+/i.test(n)) return true;
  return false;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dlat = (lat1 - lat2) * 111;
  const dlng = (lng1 - lng2) * 111 * Math.cos((lat1 * Math.PI) / 180);
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

/** Nearest named Delhi locality from the gazetteer */
export function nearestDelhiPlace(
  lat: number,
  lng: number,
): { name: string; km: number } {
  let bestName = "Connaught Place";
  let bestKm = Infinity;

  for (const [name, coords] of Object.entries(DELHI_LOCATIONS)) {
    const km = haversineKm(lat, lng, coords.lat, coords.lng);
    if (km < bestKm) {
      bestKm = km;
      bestName = name;
    }
  }

  return { name: bestName, km: bestKm };
}

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

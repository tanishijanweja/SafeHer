import type { GeoPoint } from "./types";

/**
 * Geo helpers used across SafeHer.
 * Map projection is a simple equirectangular view around the Delhi region
 * (the default area SafeHer is seeded with).
 */

export const DELHI_BOUNDS = {
  minLat: 28.36,
  maxLat: 28.9,
  minLng: 76.78,
  maxLng: 77.36,
  center: { lat: 28.6139, lng: 77.209 } as GeoPoint,
};

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function geohashEncode(lat: number, lng: number, precision = 6): string {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let hash = "";
  let bit = 0;
  let ch = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        lngMin = mid;
      } else {
        ch = ch << 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latMin = mid;
      } else {
        ch = ch << 1;
        latMax = mid;
      }
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/** Decode the first cell (top-left-ish corner) of a geohash. */
export function geohashDecode(hash: string): { lat: number; lng: number } {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let even = true;

  for (const char of hash) {
    const cd = BASE32.indexOf(char);
    for (let mask = 16; mask; mask >>= 1) {
      if (even) {
        const mid = (lngMin + lngMax) / 2;
        if (cd & mask) lngMin = mid;
        else lngMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (cd & mask) latMin = mid;
        else latMax = mid;
      }
      even = !even;
    }
  }
  return { lat: (latMin + latMax) / 2, lng: (lngMin + lngMax) / 2 };
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}

/** Project a geo point into a normalized [0,1]x[0,1] space inside DELHI_BOUNDS. */
export function project(p: GeoPoint): { x: number; y: number } {
  const x = (p.lng - DELHI_BOUNDS.minLng) / (DELHI_BOUNDS.maxLng - DELHI_BOUNDS.minLng);
  const y = 1 - (p.lat - DELHI_BOUNDS.minLat) / (DELHI_BOUNDS.maxLat - DELHI_BOUNDS.minLat);
  return { x: clamp01(x), y: clamp01(y) };
}

export function unproject(x: number, y: number): GeoPoint {
  const lng = DELHI_BOUNDS.minLng + x * (DELHI_BOUNDS.maxLng - DELHI_BOUNDS.minLng);
  const lat = DELHI_BOUNDS.maxLat - y * (DELHI_BOUNDS.maxLat - DELHI_BOUNDS.minLat);
  return { lat, lng };
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function riskColor(score: number): string {
  if (score >= 4) return "#ff4d6d";
  if (score >= 3) return "#ff7aa8";
  if (score >= 2) return "#f472b6";
  return "#f9a8d4";
}

export function severityColor(severity: number): string {
  return riskColor(severity);
}

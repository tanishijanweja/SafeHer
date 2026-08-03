/** Group geohash heatmap cells into locality polygons for choropleth display. */

export type RiskLevel = "Low" | "Medium" | "High";

export type HeatmapCell = {
  id: string;
  latitude: number;
  longitude: number;
  areaName: string;
  riskLevel: RiskLevel;
  newsIncidentCount: number;
  communityReportCount: number;
  recentCategories: string[];
  reasons: string[];
  lastUpdated: string;
};

export type AreaRegion = {
  id: string;
  areaName: string;
  riskLevel: RiskLevel;
  newsIncidentCount: number;
  communityReportCount: number;
  recentCategories: string[];
  reasons: string[];
  lastUpdated: string;
  /** Leaflet latlng rings: [lat, lng][] */
  polygon: [number, number][];
  center: { lat: number; lng: number };
};

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Decode geohash to [minLat, minLng, maxLat, maxLng] */
export function decodeGeohashBbox(hash: string): [number, number, number, number] {
  let even = true;
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;

  for (const ch of hash.toLowerCase()) {
    const cd = BASE32.indexOf(ch);
    if (cd < 0) continue;
    for (let mask = 16; mask > 0; mask >>= 1) {
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
  return [latMin, lngMin, latMax, lngMax];
}

function riskRank(level: RiskLevel): number {
  if (level === "High") return 2;
  if (level === "Medium") return 1;
  return 0;
}

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return riskRank(a) >= riskRank(b) ? a : b;
}

function areaKey(name: string): string {
  return name.replace(/^Near\s+/i, "").trim().toLowerCase();
}

function pickDisplayName(names: string[]): string {
  const exact = names.find((n) => !/^Near\s+/i.test(n));
  return exact ?? names[0] ?? "Delhi NCR";
}

/** Monotone-chain convex hull. Points as [lat, lng]. */
function convexHull(points: [number, number][]): [number, number][] {
  const uniq = new Map<string, [number, number]>();
  for (const p of points) uniq.set(`${p[0]},${p[1]}`, p);
  const pts = [...uniq.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  if (pts.length <= 2) return pts;

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);

  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Slight inset toward centroid so neighboring regions don't paint over each other. */
function insetPolygon(ring: [number, number][], factor = 0.92): [number, number][] {
  if (ring.length < 3) return ring;
  let lat = 0;
  let lng = 0;
  for (const [a, b] of ring) {
    lat += a;
    lng += b;
  }
  lat /= ring.length;
  lng /= ring.length;
  return ring.map(([a, b]) => [
    lat + (a - lat) * factor,
    lng + (b - lng) * factor,
  ]);
}

function buildSimpleReasons(
  newsCount: number,
  reportCount: number,
  cellReasons: string[],
): string[] {
  const out: string[] = [];

  if (newsCount > 0) {
    out.push(
      newsCount === 1
        ? "1 recent crime news report"
        : `${newsCount} recent crime news reports`,
    );
  }

  const histHigh = cellReasons.some((r) => /higher historical/i.test(r));
  const histSome = cellReasons.some((r) => /some historical/i.test(r));
  if (histHigh) out.push("High historical crime");
  else if (histSome) out.push("Some historical crime activity");

  if (reportCount > 0) {
    out.push(
      reportCount === 1
        ? "1 community safety report"
        : `${reportCount} community safety reports`,
    );
  } else {
    out.push("No community reports");
  }

  return out;
}

/**
 * Merge cells that share the same locality into one colored region.
 * Polygon = convex hull of geohash bboxes (slightly inset).
 */
export function groupCellsIntoAreas(cells: HeatmapCell[]): AreaRegion[] {
  type Acc = {
    names: string[];
    riskLevel: RiskLevel;
    newsIncidentCount: number;
    communityReportCount: number;
    categories: Set<string>;
    reasons: string[];
    lastUpdated: string;
    corners: [number, number][];
    latSum: number;
    lngSum: number;
    n: number;
  };

  const groups = new Map<string, Acc>();

  for (const cell of cells) {
    const key = areaKey(cell.areaName || "Delhi NCR");
    let g = groups.get(key);
    if (!g) {
      g = {
        names: [],
        riskLevel: "Low",
        newsIncidentCount: 0,
        communityReportCount: 0,
        categories: new Set(),
        reasons: [],
        lastUpdated: cell.lastUpdated,
        corners: [],
        latSum: 0,
        lngSum: 0,
        n: 0,
      };
      groups.set(key, g);
    }

    g.names.push(cell.areaName);
    g.riskLevel = maxRisk(g.riskLevel, cell.riskLevel);
    g.newsIncidentCount = Math.max(g.newsIncidentCount, cell.newsIncidentCount);
    g.communityReportCount += cell.communityReportCount;
    for (const c of cell.recentCategories) g.categories.add(c);
    g.reasons.push(...cell.reasons);
    if (new Date(cell.lastUpdated).getTime() > new Date(g.lastUpdated).getTime()) {
      g.lastUpdated = cell.lastUpdated;
    }

    try {
      const [minLat, minLng, maxLat, maxLng] = decodeGeohashBbox(cell.id);
      g.corners.push(
        [minLat, minLng],
        [minLat, maxLng],
        [maxLat, minLng],
        [maxLat, maxLng],
      );
    } catch {
      g.corners.push([cell.latitude, cell.longitude]);
    }

    g.latSum += cell.latitude;
    g.lngSum += cell.longitude;
    g.n += 1;
  }

  const regions: AreaRegion[] = [];

  for (const [key, g] of groups) {
    if (g.n === 0) continue;
    const areaName = pickDisplayName(g.names);
    let hull = convexHull(g.corners);

    if (hull.length < 3) {
      const pad = 0.008;
      const lat = g.latSum / g.n;
      const lng = g.lngSum / g.n;
      hull = [
        [lat - pad, lng - pad],
        [lat - pad, lng + pad],
        [lat + pad, lng + pad],
        [lat + pad, lng - pad],
      ];
    } else {
      hull = insetPolygon(hull, 0.9);
    }

    // Close ring for Leaflet
    const first = hull[0]!;
    const last = hull[hull.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      hull = [...hull, first];
    }

    regions.push({
      id: key,
      areaName,
      riskLevel: g.riskLevel,
      newsIncidentCount: g.newsIncidentCount,
      communityReportCount: g.communityReportCount,
      recentCategories: [...g.categories].slice(0, 3),
      reasons: buildSimpleReasons(
        g.newsIncidentCount,
        g.communityReportCount,
        g.reasons,
      ),
      lastUpdated: g.lastUpdated,
      polygon: hull,
      center: { lat: g.latSum / g.n, lng: g.lngSum / g.n },
    });
  }

  // High risk on top when drawn later
  regions.sort((a, b) => riskRank(a.riskLevel) - riskRank(b.riskLevel));
  return regions;
}

export function riskColor(level: RiskLevel): string {
  if (level === "High") return "#ef4444";
  if (level === "Medium") return "#eab308";
  return "#22c55e";
}

export function riskEmoji(level: RiskLevel): string {
  if (level === "High") return "🔴";
  if (level === "Medium") return "🟡";
  return "🟢";
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "unknown";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? "1 minute ago" : `${min} minutes ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? "1 hour ago" : `${hr} hours ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

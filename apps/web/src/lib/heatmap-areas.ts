/** Group locality heatmap areas from the server into renderable polygons. */

export type RiskLevel = "Low" | "Medium" | "High";

export type NewsArticleRef = {
  title: string;
  publishedAt: string;
  sourceDomain?: string | null;
  url?: string | null;
};

export type CommunityReportRef = {
  title: string;
  description?: string | null;
  category?: string | null;
  createdAt: string;
  incidentDate?: string | null;
};

export type DemoHistoricalIncidentRef = {
  title: string;
  date: string;
};

/**
 * A single aggregated area returned by `/heatmap`. Neighbouring geohash cells
 * that share a locality are collapsed server-side into one entry, so the heavy
 * news/history/analysis is transmitted exactly once. The server also pre-computes
 * the compact convex-hull polygon + centre so the client never needs the raw
 * cell geometry on the wire.
 */
export type HeatmapArea = {
  id: string;
  areaName: string;
  riskLevel: RiskLevel;
  newsIncidentCount: number;
  communityReportCount: number;
  recentCategories: string[];
  reasons: string[];
  newsArticles: NewsArticleRef[];
  communityReports: CommunityReportRef[];
  historicalDistrict?: string | null;
  historicalSource?: string | null;
  demoHistorical?: DemoHistoricalIncidentRef[];
  lastUpdated: string;
  /** Leaflet latlng ring: [lat, lng][] */
  polygon: [number, number][];
  center: { lat: number; lng: number };
};

export type AreaRegion = {
  id: string;
  areaName: string;
  riskLevel: RiskLevel;
  newsIncidentCount: number;
  communityReportCount: number;
  recentCategories: string[];
  reasons: string[];
  newsArticles: NewsArticleRef[];
  communityReports: CommunityReportRef[];
  historicalDistrict: string | null;
  historicalSource: string | null;
  demoHistorical: DemoHistoricalIncidentRef[];
  lastUpdated: string;
  /** Leaflet latlng rings: [lat, lng][] */
  polygon: [number, number][];
  center: { lat: number; lng: number };
};

function riskRank(level: RiskLevel): number {
  if (level === "High") return 2;
  if (level === "Medium") return 1;
  return 0;
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
        ? "1 recent news report"
        : `${newsCount} recent news reports`,
    );
  }

  const histHigh = cellReasons.some((r) => /higher historical/i.test(r));
  const histSome = cellReasons.some((r) => /some historical/i.test(r));
  if (histHigh) out.push("High historical crime");
  else if (histSome) out.push("Some historical crime activity");

  if (reportCount > 0) {
    out.push(
      reportCount === 1
        ? "1 community report"
        : `${reportCount} community reports`,
    );
  } else {
    out.push("No community reports");
  }

  return out;
}

/**
 * Normalise server-aggregated localities into renderable regions. The server
 * already dedupes news/history per locality and pre-computes a compact convex
 * hull polygon + centre, so the client just wraps it and adds display reasons.
 */
export function groupCellsIntoAreas(areas: HeatmapArea[]): AreaRegion[] {
  return areas
    .map((area) => ({
      id: area.id,
      areaName: area.areaName,
      riskLevel: area.riskLevel,
      newsIncidentCount: area.newsIncidentCount,
      communityReportCount: area.communityReportCount,
      recentCategories: area.recentCategories ?? [],
      reasons: buildSimpleReasons(
        area.newsIncidentCount,
        area.communityReportCount,
        area.reasons ?? [],
      ),
      newsArticles: area.newsArticles ?? [],
      communityReports: area.communityReports ?? [],
      historicalDistrict: area.historicalDistrict ?? null,
      historicalSource: area.historicalSource ?? "NCRB",
      demoHistorical: area.demoHistorical ?? [],
      lastUpdated: area.lastUpdated,
      polygon: area.polygon ?? [],
      center: area.center ?? { lat: 0, lng: 0 },
    }))
    .sort((a, b) => riskRank(a.riskLevel) - riskRank(b.riskLevel));
}

/**
 * True when a locality actually has something useful to show, using the real
 * backend fields (not the display-layer). A card is only worth rendering when
 * it has news, community reports, incident tags, real historical/demo data, or
 * a genuine risk explanation. The "No community reports" reason is boilerplate
 * injected by `buildSimpleReasons` and is never treated as content on its own.
 */
export function hasMeaningfulAreaData(area: AreaRegion): boolean {
  if (area.newsArticles.length > 0) return true;
  if (area.communityReports.length > 0) return true;
  if ((area.recentCategories ?? []).length > 0) return true;
  if (area.historicalDistrict && area.historicalDistrict.length > 0) return true;
  if ((area.demoHistorical ?? []).length > 0) return true;
  return area.reasons.some((reason) => reason.trim() !== "No community reports");
}

/**
 * Ray-casting point-in-polygon test against a Leaflet ring ([lat, lng][]).
 * Reused to decide whether a searched coordinate falls inside a locality's
 * risk polygon without duplicating the server's geohash geometry.
 */
export function pointInPolygon(
  point: { lat: number; lng: number },
  ring: [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]!;
    const [yj, xj] = ring[j]!;
    const crosses =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function normalizeAreaName(name: string): string {
  return name.toLowerCase().replace(/^near\s+/i, "").trim();
}

/**
 * Resolve a geocoded search result to the locality it belongs to, reusing the
 * server-computed area geometry. The geocoder's display string is hierarchical
 * ("Sector 12, Dwarka, South West Delhi, …"), so only its leading component is
 * trusted for a name match — later parts are parent administrative units that
 * often coincide with area names but are not what the user searched. Exact name
 * match wins, then a prefix match, then falling back to the risk polygon that
 * physically contains the coordinate. Returns null when the location has no
 * covered risk data, so the caller can show the "no data" state instead of
 * highlighting a neighbouring area.
 */
export function findAreaForSearch(
  displayName: string,
  point: { lat: number; lng: number },
  areas: AreaRegion[],
): AreaRegion | null {
  const primary = displayName
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];

  if (primary) {
    const norm = normalizeAreaName(primary);
    const normAreas = areas.map((a) => ({
      area: a,
      name: normalizeAreaName(a.areaName),
    }));

    const exact = normAreas.find((a) => a.name === norm);
    if (exact) return exact.area;

    let best: AreaRegion | null = null;
    let bestLen = -1;
    for (const a of normAreas) {
      if (!a.name || a.name.length < 2) continue;
      const forward = norm.startsWith(`${a.name} `) && a.name.length > bestLen;
      const backward = a.name.startsWith(`${norm} `) && a.name.length > bestLen;
      if (forward || backward) {
        best = a.area;
        bestLen = a.name.length;
      }
    }
    if (best) return best;
  }

  for (const area of areas) {
    if (area.polygon.length >= 3 && pointInPolygon(point, area.polygon)) {
      return area;
    }
  }
  return null;
}

export function riskColor(level: RiskLevel): string {
  if (level === "High") return "#e11d48";
  if (level === "Medium") return "#d97706";
  return "#059669";
}

export function riskEmoji(level: RiskLevel): string {
  if (level === "High") return "●";
  if (level === "Medium") return "●";
  return "●";
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

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Format an ISO timestamp as e.g. "6 Aug 2026 • 9:00 AM" in local time. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "unknown";
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()} • ${h}:${mm} ${ampm}`;
}

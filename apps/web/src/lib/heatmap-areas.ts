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

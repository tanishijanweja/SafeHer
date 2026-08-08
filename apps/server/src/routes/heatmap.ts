import { Hono } from "hono";
import ngeohash from "ngeohash";

import prisma from "@safe-her/db";
import { nearestDelhiPlace } from "@safe-her/db/delhi-locations";
import {
  MIN_NEWS_PREFIX_LEN,
  NEWS_WINDOW_DAYS,
  selectHeatmapNews,
} from "@safe-her/db/news-scoring";

import { resolveAreaName } from "../services/area-name";

const heatmapRouter = new Hono();

const MIN_PREFIX_LEN = MIN_NEWS_PREFIX_LEN;

const CATEGORY_LABELS: Record<string, string> = {
  sexual_violence: "Sexual violence",
  harassment: "Harassment",
  domestic_violence: "Domestic violence",
  kidnapping: "Kidnapping",
  homicide_assault: "Assault",
  robbery_theft: "Robbery",
  other_crime: "Other crime",
  not_incident: "Other",
};

function commonPrefixLen(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  for (; i < limit; i++) {
    if (a[i] !== b[i]) break;
  }
  return i;
}

function riskLevel(score: number): "Low" | "Medium" | "High" {
  if (score < 0.25) return "Low";
  if (score < 0.5) return "Medium";
  return "High";
}

const RISK_RANK: Record<"Low" | "Medium" | "High", number> = {
  Low: 0,
  Medium: 1,
  High: 2,
};

/**
 * Locality-aware grouping key. Several geohash cells can sit inside one named
 * area; we collapse them into a single payload entry so identical news/history
 * is sent exactly once. "Near <place>" is normalised to <place> so a cluster
 * never splits across a whitespace variant.
 */
function localityKey(name: string): string {
  return name.replace(/^Near\s+/i, "").trim().toLowerCase();
}

/** Monotone-chain convex hull over [lat, lng] points. */
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

/** Slight inset toward centroid so neighbouring regions don't paint over each other. */
function insetPolygon(ring: [number, number][], factor = 0.9): [number, number][] {
  if (ring.length < 3) return ring;
  let lat = 0;
  let lng = 0;
  for (const [a, b] of ring) {
    lat += a;
    lng += b;
  }
  lat /= ring.length;
  lng /= ring.length;
  return ring.map(([a, b]) => [lat + (a - lat) * factor, lng + (b - lng) * factor]);
}

/**
 * Build the compact polygon for a locality from its member geohash cells:
 * convex hull of the cells' bounding boxes, lightly inset, then closed.
 */
function localityPolygon(
  cells: { id: string; latitude: number; longitude: number }[],
): { polygon: [number, number][]; center: { lat: number; lng: number } } {
  const round = (v: number) => Math.round(v * 1e5) / 1e5;
  const corners: [number, number][] = [];
  let latSum = 0;
  let lngSum = 0;
  for (const cell of cells) {
    try {
      const [minLat, minLng, maxLat, maxLng] = ngeohash.decode_bbox(cell.id);
      corners.push([minLat, minLng], [minLat, maxLng], [maxLat, minLng], [maxLat, maxLng]);
    } catch {
      corners.push([cell.latitude, cell.longitude]);
    }
    latSum += cell.latitude;
    lngSum += cell.longitude;
  }
  const n = cells.length;
  const center = { lat: round(latSum / n), lng: round(lngSum / n) };

  let hull = convexHull(corners);
  if (hull.length < 3) {
    const pad = 0.008;
    hull = [
      [center.lat - pad, center.lng - pad],
      [center.lat - pad, center.lng + pad],
      [center.lat + pad, center.lng + pad],
      [center.lat + pad, center.lng - pad],
    ];
  } else {
    hull = insetPolygon(hull, 0.9);
  }

  const first = hull[0]!;
  const last = hull[hull.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) hull = [...hull, first];
  return { polygon: hull.map(([a, b]) => [round(a), round(b)]) as [number, number][], center };
}

function formatCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return CATEGORY_LABELS[raw] ?? raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The popup's locality label. Never a geohash or a synthetic token.
 * Prefers the locality of the matched news, then the nearest gazetteer
 * locality (only when genuinely close), and only falls back to the historical
 * district for points far from any named locality — so an area like
 * "Chhatarpur" is never relabelled by its district ("South West").
 */
function resolveCellAreaName(
  lat: number,
  lng: number,
  newsLocality: string | null | undefined,
  histDistrict: string | null,
): string {
  const nearest = nearestDelhiPlace(lat, lng);
  const candidates: Array<string | null | undefined> = [newsLocality];
  if (nearest.km <= 8) candidates.push(nearest.name);
  candidates.push(histDistrict);
  return resolveAreaName(lat, lng, ...candidates);
}

heatmapRouter.get("/", async (c) => {
  try {
    const scores = await prisma.riskScore.findMany({
      where: {
        OR: [
          { combinedScore: { gte: 0.15 } },
          { incidentCount: { gt: 0 } },
        ],
      },
      orderBy: { combinedScore: "desc" },
    });

    if (scores.length === 0) {
      return c.json([]);
    }

    const cutoff = new Date(Date.now() - NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [newsRows, demoRows, historicalRows, reportGroups, recentReports] =
      await Promise.all([
        prisma.newsIncident.findMany({
          where: {
            localityName: { not: null },
            publishedAt: { gte: cutoff },
          },
          orderBy: { publishedAt: "desc" },
          select: {
            geohash: true,
            latitude: true,
            longitude: true,
            category: true,
            localityName: true,
            dedupeKey: true,
            publishedAt: true,
            title: true,
            url: true,
            sourceDomain: true,
            affectsHeatmap: true,
            severity: true,
            confidence: true,
          },
        }),
        // Demo/historical seed incidents (no live locality). They only feed the
        // popup's "Historical / demo" section — never "Recent news" below.
        prisma.newsIncident.findMany({
          where: { localityName: null },
          orderBy: { publishedAt: "desc" },
          select: {
            latitude: true,
            longitude: true,
            publishedAt: true,
            title: true,
            sourceDomain: true,
          },
        }),
      prisma.historicalRisk.findMany({
        select: { geohash: true, district: true },
      }),
      prisma.report.groupBy({
        by: ["geohash"],
        where: { isSpam: false },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.report.findMany({
        where: { isSpam: false },
        orderBy: { createdAt: "desc" },
        take: 120,
        select: {
          geohash: true,
          title: true,
          description: true,
          category: true,
          createdAt: true,
          incidentDate: true,
        },
      }),
    ]);

    const reportCountByGh = new Map(
      reportGroups.map((g) => [g.geohash, g._count._all]),
    );
    const latestReportByGh = new Map<string, Date>(
      reportGroups
        .filter((g) => g._max.createdAt !== null)
        .map((g) => [g.geohash, g._max.createdAt as Date]),
    );

    // Newest few community reports per cell, capped so the popup stays light.
    const reportsByGh = new Map<
      string,
      Array<{
title: string;
      description: string | null;
      category: string | null;
      createdAt: Date;
      incidentDate: Date | null;
    }>
    >();
    for (const r of recentReports) {
      if (!r.geohash) continue;
      const arr = reportsByGh.get(r.geohash) ?? [];
      if (arr.length >= 3) continue;
      arr.push(r);
      reportsByGh.set(r.geohash, arr);
    }

    // Seed/demo incidents have no stored locality, but we still tag each one to
    // the gazetteer locality it physically sits in so it can appear only under
    // that area's "Historical / demo" section.
    const demoRowsByLocality = new Map<string, typeof demoRows>();
    for (const d of demoRows) {
      const name = nearestDelhiPlace(d.latitude, d.longitude).name;
      const arr = demoRowsByLocality.get(name) ?? [];
      if (arr.length < 8) arr.push(d);
      demoRowsByLocality.set(name, arr);
    }

    // ---- Aggregate cells into one payload entry per locality ----
    // The same locality is often covered by several geohash cells. To keep the
    // payload small and reliably deduplicated we attach the (mostly identical)
    // news/history/analysis to the locality once, and only carry each cell's
    // lightweight geometry with it for polygon rendering. Every cell is kept
    // (including historical-only, Low cells that used to be filtered out).
    type Geom = { id: string; latitude: number; longitude: number };
    type Acc = {
      id: string;
      areaName: string;
      rank: number;
      riskLevel: "Low" | "Medium" | "High";
      newsIncidentCount: number;
      communityReportCount: number;
      highestHistoricalScore: number;
      categories: Set<string>;
      reasons: Set<string>;
      articles: Map<string, { title: string; publishedAt: string; sourceDomain: string | null; url: string | null }>;
      reports: Map<string, { title: string; description: string | null; category: string | null; createdAt: string; incidentDate: string | null }>;
      demos: Map<string, { title: string; date: string }>;
      districts: Set<string>;
      latestActivityAt: Date;
      cells: Geom[];
    };

    const areas = new Map<string, Acc>();
    const getOrCreate = (key: string, areaName: string, latestActivityAt: Date): Acc => {
      let acc = areas.get(key);
      if (!acc) {
        acc = {
          id: key,
          areaName,
          rank: -1,
          riskLevel: "Low",
          newsIncidentCount: 0,
          communityReportCount: 0,
          highestHistoricalScore: 0,
          categories: new Set(),
          reasons: new Set(),
          articles: new Map(),
          reports: new Map(),
          demos: new Map(),
          districts: new Set(),
          latestActivityAt,
          cells: [],
        };
        areas.set(key, acc);
      }
      return acc;
    };

    for (const score of scores) {
      const center = ngeohash.decode(score.geohash);
      const lat = center.latitude;
      const lng = center.longitude;

      // News that fed this cell's risk score == news the area should show.
      const matchedNews = selectHeatmapNews(score.geohash, newsRows, new Date());
      const newsLocality = matchedNews.find(
        (n) => n.localityName && n.localityName.trim(),
      )?.localityName;

      let histDistrict: string | null = null;
      let bestHistPrefix = 0;
      for (const h of historicalRows) {
        const p = commonPrefixLen(score.geohash, h.geohash);
        if (p >= MIN_PREFIX_LEN && p > bestHistPrefix) {
          bestHistPrefix = p;
          histDistrict = h.district;
        }
      }

      const areaName = resolveCellAreaName(lat, lng, newsLocality, histDistrict);

      const demoNotes = (demoRowsByLocality.get(areaName) ?? []).map((d) => ({
        title: d.title,
        date: new Date(d.publishedAt).toISOString(),
      }));

      const categories = new Set<string>();
      for (const n of matchedNews) {
        const label = formatCategory(n.category);
        if (label) categories.add(label);
      }

      const newsIncidentCount = matchedNews.length;
      const communityReportCount =
        reportCountByGh.get(score.geohash) ?? score.incidentCount ?? 0;

      const level = riskLevel(score.combinedScore);
      const reasons = new Set<string>();

      if (newsIncidentCount >= 3) {
        reasons.add("Several recent crime incidents reported nearby");
      } else if (newsIncidentCount === 2) {
        reasons.add("A few recent crime incidents reported nearby");
      } else if (newsIncidentCount === 1) {
        reasons.add("A recent crime incident was reported nearby");
      }

      if (score.historicalScore >= 0.5) {
        reasons.add("Area has a higher historical crime trend");
      } else if (score.historicalScore >= 0.25) {
        reasons.add("Area has some historical crime activity");
      }

      if (communityReportCount === 1) {
        reasons.add("1 community safety report has been submitted recently");
      } else if (communityReportCount > 1) {
        reasons.add(
          `${communityReportCount} community safety reports have been submitted recently`,
        );
      }

      if (reasons.size === 0) {
        reasons.add("No strong recent risk signals for this area");
      }

      const latestActivityAt =
        matchedNews[0]?.publishedAt ??
        latestReportByGh.get(score.geohash) ??
        score.lastUpdated;

      const key = localityKey(areaName);
      const acc = getOrCreate(key, areaName, latestActivityAt);

      acc.areaName = areaName;
      if (RISK_RANK[level] > acc.rank) {
        acc.rank = RISK_RANK[level];
        acc.riskLevel = level;
      }
      acc.newsIncidentCount = Math.max(acc.newsIncidentCount, newsIncidentCount);
      acc.communityReportCount += communityReportCount;
      acc.highestHistoricalScore = Math.max(
        acc.highestHistoricalScore,
        score.historicalScore,
      );
      for (const c of categories) acc.categories.add(c);
      for (const r of reasons) acc.reasons.add(r);
      for (const n of matchedNews) {
        if (!acc.articles.has(n.title)) {
          acc.articles.set(n.title, {
            title: n.title,
            publishedAt: new Date(n.publishedAt).toISOString(),
            sourceDomain: n.sourceDomain ?? null,
            url: n.url ?? null,
          });
        }
      }
      for (const r of reportsByGh.get(score.geohash) ?? []) {
        const t = r.title || "Community report";
        if (!acc.reports.has(t)) {
          acc.reports.set(t, {
            title: t,
            description: r.description,
            category: formatCategory(r.category),
            createdAt: new Date(r.createdAt).toISOString(),
            incidentDate: r.incidentDate
              ? new Date(r.incidentDate).toISOString()
              : null,
          });
        }
      }
      for (const d of demoNotes) {
        if (!acc.demos.has(d.title)) acc.demos.set(d.title, d);
      }
      if (histDistrict) acc.districts.add(histDistrict);
      if (latestActivityAt.getTime() > acc.latestActivityAt.getTime()) {
        acc.latestActivityAt = latestActivityAt;
      }
      acc.cells.push({ id: score.geohash, latitude: lat, longitude: lng });
    }

    const areasOut = [...areas.values()].map((acc) => {
      const geom = localityPolygon(acc.cells);
      return {
        id: acc.id,
        areaName: acc.areaName,
        riskLevel: acc.riskLevel,
        newsIncidentCount: acc.newsIncidentCount,
        communityReportCount: acc.communityReportCount,
        recentCategories: [...acc.categories].slice(0, 3),
        reasons: [...acc.reasons],
        newsArticles: [...acc.articles.values()]
          .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
          .slice(0, 8),
        communityReports: [...acc.reports.values()].slice(0, 3),
        historicalDistrict: acc.districts.size > 0 ? [...acc.districts][0] : null,
        historicalSource: "NCRB",
        demoHistorical: [...acc.demos.values()].slice(0, 3),
        lastUpdated: new Date(acc.latestActivityAt).toISOString(),
        polygon: geom.polygon,
        center: geom.center,
      };
    });

    return c.json(areasOut);
  } catch (error) {
    console.error("/heatmap error:", error);
    return c.json(
      {
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

export default heatmapRouter;

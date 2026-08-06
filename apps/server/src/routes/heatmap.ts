import { Hono } from "hono";
import ngeohash from "ngeohash";

import prisma from "@safe-her/db";
import { NEWS_WINDOW_DAYS, MIN_NEWS_PREFIX_LEN } from "@safe-her/db/news-scoring";

import { resolveAreaName } from "../services/area-name";

const heatmapRouter = new Hono();

const MIN_PREFIX_LEN = MIN_NEWS_PREFIX_LEN;
const HEATMAP_DISPLAY_PREFIX_LEN = 5;

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

function formatCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return CATEGORY_LABELS[raw] ?? raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

    const [newsRows, historicalRows, reportGroups] = await Promise.all([
      prisma.newsIncident.findMany({
        where: {
          publishedAt: { gte: cutoff },
        },
        orderBy: { publishedAt: "desc" },
        select: {
          geohash: true,
          category: true,
          localityName: true,
          publishedAt: true,
          title: true,
          affectsHeatmap: true,
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
    ]);

    const reportCountByGh = new Map(
      reportGroups.map((g) => [g.geohash, g._count._all]),
    );
    const latestReportByGh = new Map<string, Date>(
      reportGroups
        .filter((g) => g._max.createdAt !== null)
        .map((g) => [g.geohash, g._max.createdAt as Date]),
    );

    const cells = scores.map((score) => {
      const center = ngeohash.decode(score.geohash);
      const lat = center.latitude;
      const lng = center.longitude;

      let bestNewsPrefix = 0;
      const matchedNews: typeof newsRows = [];
      for (const n of newsRows) {
        const p = commonPrefixLen(score.geohash, n.geohash);
        if (p < HEATMAP_DISPLAY_PREFIX_LEN) continue;
        if (p > bestNewsPrefix) {
          bestNewsPrefix = p;
          matchedNews.length = 0;
          matchedNews.push(n);
        } else if (p === bestNewsPrefix) {
          matchedNews.push(n);
        }
      }

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

      const areaName = resolveAreaName(lat, lng, newsLocality, histDistrict);

      const categories: string[] = [];
      const seen = new Set<string>();
      for (const n of matchedNews) {
        const label = formatCategory(n.category);
        if (!label || seen.has(label)) continue;
        seen.add(label);
        categories.push(label);
        if (categories.length >= 3) break;
      }

      const newsIncidentCount = matchedNews.length;
      const communityReportCount =
        reportCountByGh.get(score.geohash) ?? score.incidentCount ?? 0;

      const level = riskLevel(score.combinedScore);
      const reasons: string[] = [];

      if (newsIncidentCount >= 3) {
        reasons.push("Several recent crime incidents reported nearby");
      } else if (newsIncidentCount === 2) {
        reasons.push("A few recent crime incidents reported nearby");
      } else if (newsIncidentCount === 1) {
        reasons.push("A recent crime incident was reported nearby");
      }

      if (score.historicalScore >= 0.5) {
        reasons.push("Area has a higher historical crime trend");
      } else if (score.historicalScore >= 0.25) {
        reasons.push("Area has some historical crime activity");
      }

      if (communityReportCount === 1) {
        reasons.push("1 community safety report has been submitted recently");
      } else if (communityReportCount > 1) {
        reasons.push(
          `${communityReportCount} community safety reports have been submitted recently`,
        );
      }

      if (reasons.length === 0) {
        reasons.push("No strong recent risk signals for this area");
      }

      // Latest activity for the area: newest matched news article, then newest
      // community report, then fall back to the risk score update time.
      const latestActivityAt =
        matchedNews[0]?.publishedAt ??
        latestReportByGh.get(score.geohash) ??
        score.lastUpdated;

      return {
        id: score.geohash,
        latitude: lat,
        longitude: lng,
        areaName,
        riskLevel: level,
        newsIncidentCount,
        communityReportCount,
        recentCategories: categories,
        reasons,
        newsArticles: matchedNews.slice(0, 8).map((n) => ({
          title: n.title,
          publishedAt: new Date(n.publishedAt).toISOString(),
        })),
        lastUpdated: new Date(latestActivityAt).toISOString(),
      };
    });

    const filteredCells = cells.filter(
      (cell) =>
        cell.newsIncidentCount > 0 ||
        cell.communityReportCount > 0,
    );

    return c.json(filteredCells);
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

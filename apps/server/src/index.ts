import { auth } from "@safe-her/auth";
import prisma from "@safe-her/db";
import { env } from "@safe-her/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import reportsRouter from "./routes/reports";
import heatmapRouter from "./routes/heatmap";
import contactsRouter from "./routes/contacts";
import sosRouter from "./routes/sos";
import newsRouter from "./routes/news";
import { generateGeohash } from "./services/geohash";
import {
  getHistoricalScore,
  calculateLiveScore,
  calculateCombinedScore,
  getReportsByGeohash,
} from "./services/risk";
import {
  getNewsDerivedScore,
  MAX_INCIDENTS_FOR_FULL_SCORE,
  MIN_NEWS_PREFIX_LEN,
  NEWS_WINDOW_DAYS,
} from "./services/news-risk";
import {
  newsRecencyWeight,
} from "@safe-her/db/news-scoring";

const MIN_PREFIX_LEN = MIN_NEWS_PREFIX_LEN;

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/", (c) => {
  return c.text("OK");
});

app.get("/health", async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: "ok" });
  } catch (error) {
    console.error(error);
    return c.json({ status: "error" }, 500);
  }
});

app.get("/historical", async (c) => {
  const data = await prisma.historicalRisk.findMany({
    orderBy: {
      score: "desc",
    },
  });
  return c.json(data);
});

app.get("/debug/historical", async (c) => {
  const latRaw = c.req.query("lat");
  const lngRaw = c.req.query("lng");

  if (!latRaw || !lngRaw) {
    return c.json({ error: "Missing lat or lng query parameter" }, 400);
  }

  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: "lat and lng must be valid numbers" }, 400);
  }

  const geohash = generateGeohash(lat, lng);
  const historicalScore = await getHistoricalScore(geohash);

  const allRows = await prisma.historicalRisk.findMany({
    orderBy: { score: "desc" },
  });

  const candidates = allRows
    .map((row) => {
      let prefixLen = 0;
      const limit = Math.min(geohash.length, row.geohash.length);
      for (let i = 0; i < limit; i++) {
        if (geohash[i] === row.geohash[i]) prefixLen++;
        else break;
      }
      return {
        district: row.district,
        geohash: row.geohash,
        score: row.score,
        prefixMatch: prefixLen,
      };
    })
    .filter((c) => c.prefixMatch >= MIN_PREFIX_LEN)
    .sort((a, b) => b.prefixMatch - a.prefixMatch);

  const best = allRows.find((r) => r.geohash === candidates[0]?.geohash) ?? null;

  return c.json({
    latitude: lat,
    longitude: lng,
    geohash,
    historicalScore,
    matchedDistrict: candidates[0]?.district ?? "None",
    matchedPrefix: candidates[0]?.prefixMatch ?? 0,
    match: best ?? "No historical match found",
    allCandidates: candidates,
  });
});

app.route("/reports", reportsRouter);
app.route("/heatmap", heatmapRouter);
app.route("/contacts", contactsRouter);
app.route("/sos", sosRouter);
app.route("/news", newsRouter);

app.get("/debug/news", async (c) => {
  try {
    const latRaw = c.req.query("lat");
    const lngRaw = c.req.query("lng");

    if (!latRaw || !lngRaw) {
      return c.json({ error: "Missing lat or lng query parameter" }, 400);
    }

    const lat = Number(latRaw);
    const lng = Number(lngRaw);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return c.json({ error: "lat and lng must be valid numbers" }, 400);
    }

    const geohash = generateGeohash(lat, lng);
    const now = new Date();
    const cutoff = new Date(now.getTime() - NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const allRows = await prisma.newsIncident.findMany({
      where: { publishedAt: { gte: cutoff }, affectsHeatmap: true },
      orderBy: { publishedAt: "desc" },
    });

    if (allRows.length === 0) {
      return c.json({
        latitude: lat,
        longitude: lng,
        geohash,
        newsScore: 0,
        matchedArticles: [],
        totalInWindow: 0,
      });
    }

    const scored = allRows
      .map((row) => {
        let prefixLen = 0;
        const limit = Math.min(geohash.length, row.geohash.length);
        for (let i = 0; i < limit; i++) {
          if (geohash[i] === row.geohash[i]) prefixLen++;
          else break;
        }
        const publishedAt =
          row.publishedAt instanceof Date ? row.publishedAt : new Date(row.publishedAt);
        const rw = newsRecencyWeight(publishedAt, now);
        const sev = Math.min(Math.max(Number(row.severity) || 3, 1), 5) / 5;
        const conf = Math.min(Math.max(Number(row.confidence) || 0.5, 0), 1);
        const weight = rw * sev * conf;
        return {
          id: row.id,
          title: row.title,
          url: row.url,
          sourceDomain: row.sourceDomain,
          category: row.category,
          severity: row.severity,
          confidence: row.confidence,
          isWomenSafety: row.isWomenSafety,
          localityName: row.localityName,
          latitude: row.latitude,
          longitude: row.longitude,
          geohash: row.geohash,
          publishedAt: publishedAt.toISOString(),
          prefixMatch: prefixLen,
          recencyWeight: rw,
          weight,
        };
      })
      .filter((s) => s.prefixMatch >= MIN_PREFIX_LEN && s.weight > 0);

    const bestPrefixLen = scored.reduce((max, s) => Math.max(max, s.prefixMatch), 0);

    const matchedArticles = scored
      .filter((s) => s.prefixMatch === bestPrefixLen)
      .sort((a, b) => b.weight - a.weight);

    const totalWeight = matchedArticles.reduce((sum, s) => sum + s.weight, 0);
    const newsScore = Math.min(totalWeight / MAX_INCIDENTS_FOR_FULL_SCORE, 1.0); // shared constant

    return c.json({
      latitude: lat,
      longitude: lng,
      geohash,
      newsScore,
      bestPrefixLen,
      matchedCount: matchedArticles.length,
      totalWeightedIncidents: totalWeight,
      maxForFullScore: MAX_INCIDENTS_FOR_FULL_SCORE,
      totalInWindow: allRows.length,
      matchedArticles,
    });
  } catch (error) {
    console.error("/debug/news error:", error);
    return c.json(
      {
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

app.get("/debug/risk", async (c) => {
  const latRaw = c.req.query("lat");
  const lngRaw = c.req.query("lng");

  if (!latRaw || !lngRaw) {
    return c.json({ error: "Missing lat or lng query parameter" }, 400);
  }

  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: "lat and lng must be valid numbers" }, 400);
  }

  const geohash = generateGeohash(lat, lng);

  const historicalScore = await getHistoricalScore(geohash);

  const historicalRows = await prisma.historicalRisk.findMany({ orderBy: { score: "desc" } });
  const histCandidates = historicalRows
    .map((row) => {
      let prefixLen = 0;
      const limit = Math.min(geohash.length, row.geohash.length);
      for (let i = 0; i < limit; i++) {
        if (geohash[i] === row.geohash[i]) prefixLen++;
        else break;
      }
      return { district: row.district, prefixMatch: prefixLen };
    })
    .filter((c) => c.prefixMatch >= MIN_PREFIX_LEN)
    .sort((a, b) => b.prefixMatch - a.prefixMatch);
  const matchedDistrict = histCandidates[0]?.district ?? "None";

  const reports = await getReportsByGeohash(geohash);
  const liveScore = calculateLiveScore(reports);
  const newsScore = await getNewsDerivedScore(geohash);
  const combinedScore = calculateCombinedScore(historicalScore, liveScore, newsScore);

  return c.json({
    latitude: lat,
    longitude: lng,
    geohash,
    historicalScore,
    liveScore,
    newsScore,
    combinedScore,
    weights: { historical: 0.4, live: 0.35, news: 0.25 },
    matchedDistrict,
    liveReportCount: reports.length,
  });
});

app.get("/debug/news/latest", async (c) => {
  try {
    const [total, heatmapEligible, latest] = await Promise.all([
      prisma.newsIncident.count(),
      prisma.newsIncident.count({ where: { affectsHeatmap: true } }),
      prisma.newsIncident.findMany({
        orderBy: { publishedAt: "desc" },
        take: 10,
        select: {
          title: true,
          sourceDomain: true,
          url: true,
          publishedAt: true,
          latitude: true,
          longitude: true,
          geohash: true,
          category: true,
          severity: true,
          confidence: true,
          isWomenSafety: true,
          localityName: true,
          affectsHeatmap: true,
        },
      }),
    ]);

    return c.json({ total, heatmapEligible, latest });
  } catch (error) {
    console.error("/debug/news/latest error:", error);
    return c.json(
      {
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

app.get("/debug/news/stats", async (c) => {
  try {
    const [
      total,
      womenSafety,
      heatmapEligible,
      oldest,
      newest,
      byCategory,
      localities,
      geohashes,
      ingestFiles,
    ] = await Promise.all([
      prisma.newsIncident.count(),
      prisma.newsIncident.count({ where: { isWomenSafety: true } }),
      prisma.newsIncident.count({ where: { affectsHeatmap: true } }),
      prisma.newsIncident.findFirst({
        orderBy: { publishedAt: "asc" },
        select: { publishedAt: true, title: true },
      }),
      prisma.newsIncident.findFirst({
        orderBy: { publishedAt: "desc" },
        select: { publishedAt: true, title: true },
      }),
      prisma.newsIncident.groupBy({
        by: ["category"],
        _count: { _all: true },
        orderBy: { _count: { category: "desc" } },
      }),
      prisma.newsIncident.findMany({
        where: { localityName: { not: null } },
        select: { localityName: true },
        distinct: ["localityName"],
      }),
      prisma.newsIncident.findMany({
        select: { geohash: true },
        distinct: ["geohash"],
      }),
      prisma.gkgIngestFile.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    // Incidents per month via raw SQL for efficiency
    const perMonth = await prisma.$queryRaw<
      { month: string; count: bigint }[]
    >`
      SELECT to_char(date_trunc('month', "publishedAt"), 'YYYY-MM') AS month,
             COUNT(*)::bigint AS count
      FROM "news_incident"
      GROUP BY 1
      ORDER BY 1 DESC
    `;

    return c.json({
      total,
      womenSafety,
      heatmapEligible,
      oldestArticle: oldest
        ? { publishedAt: oldest.publishedAt.toISOString(), title: oldest.title }
        : null,
      newestArticle: newest
        ? { publishedAt: newest.publishedAt.toISOString(), title: newest.title }
        : null,
      uniqueLocalities: localities.length,
      geohashesCovered: geohashes.length,
      incidentsPerCategory: Object.fromEntries(
        byCategory.map((r) => [r.category ?? "unknown", r._count._all]),
      ),
      incidentsPerMonth: Object.fromEntries(
        perMonth.map((r) => [r.month, Number(r.count)]),
      ),
      scoring: {
        windowDays: NEWS_WINDOW_DAYS,
        weights: {
          "0-7d": 1.0,
          "8-30d": 0.8,
          "31-90d": 0.6,
          "91-180d": 0.4,
          ">180d": 0,
        },
      },
      ingestWatermark: Object.fromEntries(
        ingestFiles.map((r) => [r.status, r._count._all]),
      ),
    });
  } catch (error) {
    console.error("/debug/news/stats error:", error);
    return c.json(
      {
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

export default app;

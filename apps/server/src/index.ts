import { auth } from "@safe-her/auth";
import prisma from "@safe-her/db";
import { env } from "@safe-her/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import reportsRouter from "./routes/reports";
import heatmapRouter from "./routes/heatmap";
import { generateGeohash } from "./services/geohash";
import { getHistoricalScore } from "./services/risk";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
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
    .filter((c) => c.prefixMatch >= 3)
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

export default app;

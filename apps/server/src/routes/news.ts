import { Hono } from "hono";

import prisma from "@safe-her/db";
import { nearestDelhiPlace } from "@safe-her/db/delhi-locations";
import {
  NEWS_WINDOW_DAYS,
  isSeedNews,
} from "@safe-her/db/news-scoring";

const newsRouter = new Hono();

newsRouter.get("/", async (c) => {
  try {
    const cutoff = new Date(Date.now() - NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const incidents = await prisma.newsIncident.findMany({
      where: { publishedAt: { gte: cutoff } },
      orderBy: { publishedAt: "desc" },
      take: 400,
      select: {
        id: true,
        title: true,
        url: true,
        sourceDomain: true,
        category: true,
        severity: true,
        confidence: true,
        isWomenSafety: true,
        localityName: true,
        latitude: true,
        longitude: true,
        publishedAt: true,
      },
    });

    // Exclude synthetic seed/demo rows so only live news shows in the feed.
    const articles = incidents
      .filter((n) => !isSeedNews(n))
      .map((n) => ({
        id: n.id,
        title: n.title,
        url: n.url,
        sourceDomain: n.sourceDomain,
        category: n.category,
        severity: Number(n.severity),
        confidence: Number(n.confidence),
        isWomenSafety: n.isWomenSafety,
        localityName:
          n.localityName?.trim() ||
          nearestDelhiPlace(n.latitude, n.longitude).name,
        latitude: n.latitude,
        longitude: n.longitude,
        publishedAt: new Date(n.publishedAt).toISOString(),
      }));

    return c.json(articles);
  } catch (error) {
    console.error("/news error:", error);
    return c.json(
      {
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

export default newsRouter;

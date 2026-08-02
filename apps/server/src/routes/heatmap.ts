import { Hono } from "hono";
import ngeohash from "ngeohash";

import prisma from "@safe-her/db";

const heatmapRouter = new Hono();

heatmapRouter.get("/", async (c) => {
  const scores = await prisma.riskScore.findMany({
    orderBy: { combinedScore: "desc" },
    select: {
      geohash: true,
      combinedScore: true,
      incidentCount: true,
    },
  });

  const cells = scores.map(({ geohash, combinedScore, incidentCount }) => {
    const center = ngeohash.decode(geohash);
    return {
      geohash,
      latitude: center.latitude,
      longitude: center.longitude,
      combinedScore,
      incidentCount,
    };
  });

  return c.json(cells);
});

export default heatmapRouter;

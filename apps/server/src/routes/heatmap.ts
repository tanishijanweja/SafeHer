import { Hono } from "hono";

const heatmapRouter = new Hono();

heatmapRouter.get("/", async (c) => {
  return c.json([
    {
      geohash: "te7w",
      combinedScore: 0.82,
    },
    {
      geohash: "te7x",
      combinedScore: 0.45,
    },
  ]);
});

export default heatmapRouter;

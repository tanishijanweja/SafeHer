import { Hono } from "hono";

const reportsRouter = new Hono();

reportsRouter.post("/", async (c) => {
  return c.json({ success: true, message: "Report received" });
});

reportsRouter.get("/", async (c) => {
  return c.json([
    {
      id: "1",
      category: "UNSAFE_AREA",
      description: "Poor lighting near metro station",
      latitude: 37.7749,
      longitude: -122.4194,
      severity: 3,
    },
  ]);
});

export default reportsRouter;

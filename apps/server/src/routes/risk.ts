import { Hono } from "hono";

import { recomputeRisk } from "../store";

export const risk = new Hono();

risk.get("/", (c) => {
  return c.json({ scores: recomputeRisk() });
});

import { Hono } from "hono";

import { listAlerts, listSosEvents, resolveSos, triggerSos } from "../store";

export const sos = new Hono();

sos.get("/events", (c) => {
  return c.json({ events: listSosEvents() });
});

sos.get("/alerts", (c) => {
  return c.json({ alerts: listAlerts() });
});

sos.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const lat = Number(body.latitude);
  const lng = Number(body.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: "valid latitude/longitude required" }, 400);
  }
  const result = triggerSos(
    { lat, lng },
    body.user_id ? String(body.user_id) : "test-user-001",
  );
  return c.json(result, 201);
});

sos.post("/:id/resolve", (c) => {
  const event = resolveSos(c.req.param("id"));
  if (!event) return c.json({ error: "not found" }, 404);
  return c.json({ event });
});

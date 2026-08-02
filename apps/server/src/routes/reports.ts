import { Hono } from "hono";

import {
  corroborate,
  findReport,
  insertReport,
  listReports,
  patchReport,
} from "../store";

export const reports = new Hono();

reports.get("/", (c) => {
  return c.json({ reports: listReports() });
});

reports.get("/:id", (c) => {
  const report = findReport(c.req.param("id"));
  if (!report) return c.json({ error: "not found" }, 404);
  return c.json({ report });
});

reports.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  if (!title || !description) return c.json({ error: "title and description required" }, 400);

  const lat = Number(body.latitude);
  const lng = Number(body.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: "valid latitude/longitude required" }, 400);
  }

  const report = insertReport({
    title,
    description,
    latitude: lat,
    longitude: lng,
    image_url: body.image_url ? String(body.image_url) : null,
    user_id: body.user_id ? String(body.user_id) : "test-user-001",
  });
  return c.json({ report }, 201);
});

reports.patch("/:id", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<import("../types").Report> = {};
  if (typeof body.status === "string") patch.status = body.status as never;
  if (typeof body.is_spam === "boolean") patch.is_spam = body.is_spam;
  if (typeof body.severity === "number") patch.severity = body.severity;
  if (typeof body.corroborations === "number") patch.corroborations = body.corroborations;
  const report = patchReport(c.req.param("id"), patch);
  if (!report) return c.json({ error: "not found" }, 404);
  return c.json({ report });
});

reports.post("/:id/corroborate", (c) => {
  const report = corroborate(c.req.param("id"));
  if (!report) return c.json({ error: "not found" }, 404);
  return c.json({ report });
});

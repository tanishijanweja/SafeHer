import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { contacts } from "./routes/contacts";
import { places } from "./routes/places";
import { reports } from "./routes/reports";
import { risk } from "./routes/risk";
import { sos } from "./routes/sos";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3100",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Authentication is mounted lazily: it needs the real database connection
// details (DATABASE_URL / BETTER_AUTH_SECRET). In Phase 1 the demo runs fully
// offline, so the app keeps working even when auth can't start.
try {
  const { auth } = await import("@safe-her/auth");
  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
} catch (error) {
  console.warn(
    "[safe-her] auth disabled — set DATABASE_URL + BETTER_AUTH_* to enable:",
    (error as Error).message,
  );
}

app.get("/", (c) => {
  return c.json({
    name: "SafeHer API",
    phase: "1 — fake local store (swap to shared database later)",
    endpoints: [
      "GET/POST /api/reports",
      "GET/PATCH /api/reports/:id",
      "POST /api/reports/:id/corroborate",
      "GET /api/risk",
      "GET/POST /api/sos",
      "GET /api/sos/events",
      "GET /api/sos/alerts",
      "POST /api/sos/:id/resolve",
      "GET/POST /api/contacts",
      "PATCH/DELETE /api/contacts/:id",
      "GET /api/places",
    ],
  });
});

app.route("/api/reports", reports);
app.route("/api/risk", risk);
app.route("/api/sos", sos);
app.route("/api/contacts", contacts);
app.route("/api/places", places);

// Note: `bun run src/index.ts` auto-serves the default export (Hono app with a
// .fetch handler) — set PORT to change the port (default 3110, from apps/server/.env).
export default app;

import { auth } from "@safe-her/auth";
import prisma from "@safe-her/db";
import { env } from "@safe-her/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import reportsRouter from "./routes/reports";
import heatmapRouter from "./routes/heatmap";

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

app.route("/reports", reportsRouter);
app.route("/heatmap", heatmapRouter);

export default app;

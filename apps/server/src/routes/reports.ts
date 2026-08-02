import { Hono } from "hono";
import { z } from "zod";

import prisma, { ReportCategory } from "@safe-her/db";

import { analyzeReport, generateEmbedding } from "../services/gemini";

const reportSchema = z.object({
  description: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
});

const VALID_CATEGORIES = Object.values(ReportCategory);

const reportsRouter = new Hono();

async function getDemoUser() {
  // TODO: Replace with authenticated user after Better Auth integration.
  const existing = await prisma.user.findFirst();
  if (existing) return existing;
  return prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      name: "Demo User",
      email: "demo@safe-her.local",
    },
  });
}

reportsRouter.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = reportSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { description, latitude, longitude } = parsed.data;
  const analysis = await analyzeReport(description);

  const category = VALID_CATEGORIES.includes(analysis.category)
    ? analysis.category
    : ReportCategory.OTHER;

  const user = await getDemoUser();
  const report = await prisma.report.create({
    data: {
      userId: user.id,
      title: analysis.summary,
      description,
      latitude,
      longitude,
      aiSummary: analysis.summary,
      category,
      severity: analysis.severity,
    },
  });

  const embedding = await generateEmbedding(analysis.summary);
  const vectorLiteral = `[${embedding.join(",")}]`;
  await prisma.$executeRaw`UPDATE "report" SET "embedding" = ${vectorLiteral}::vector WHERE "id" = ${report.id}`;

  return c.json(report);
});

reportsRouter.get("/", async (c) => {
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
  });
  return c.json(reports);
});

export default reportsRouter;

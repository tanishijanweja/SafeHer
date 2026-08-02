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

const DUPLICATE_SIMILARITY_THRESHOLD = 0.92;

const reportsRouter = new Hono();

async function findDuplicate(vectorLiteral: string) {
  const rows = await prisma.$queryRaw<
    { id: string; title: string; category: string; similarity: number }[]
  >`
    SELECT "id", "title", "category",
           1 - ("embedding" <=> ${vectorLiteral}::vector) AS similarity
    FROM "report"
    WHERE "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${vectorLiteral}::vector
    LIMIT 1
  `;
  const top = rows[0];
  if (top && top.similarity >= DUPLICATE_SIMILARITY_THRESHOLD) return top;
  return null;
}

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

  let analysis: Awaited<ReturnType<typeof analyzeReport>>;
  try {
    analysis = await analyzeReport(description);
  } catch (error) {
    console.error("Gemini analysis failed, using fallback:", error);
    analysis = {
      summary: description,
      category: ReportCategory.OTHER,
      severity: 1,
    };
  }

  const category = VALID_CATEGORIES.includes(analysis.category)
    ? analysis.category
    : ReportCategory.OTHER;

  try {
    const embedding = await generateEmbedding(analysis.summary);
    if (embedding.length > 0) {
      const vectorLiteral = `[${embedding.join(",")}]`;
      const duplicate = await findDuplicate(vectorLiteral);
      if (duplicate) {
        return c.json({ error: "Duplicate report", existing: duplicate }, 409);
      }

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

      await prisma.$executeRaw`UPDATE "report" SET "embedding" = ${vectorLiteral}::vector WHERE "id" = ${report.id}`;
      return c.json(report);
    }
  } catch (error) {
    console.error("Gemini embedding failed, falling back to insert:", error);
  }

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

  return c.json(report);
});

reportsRouter.get("/", async (c) => {
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
  });
  return c.json(reports);
});

export default reportsRouter;

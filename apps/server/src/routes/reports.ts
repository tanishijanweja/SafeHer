import { Hono } from "hono";
import { z } from "zod";

import { auth } from "@safe-her/auth";
import prisma, { ReportCategory } from "@safe-her/db";

import { analyzeReport, generateEmbedding } from "../services/gemini";
import { generateGeohash } from "../services/geohash";
import { refreshRiskScore } from "../services/risk";

const reportSchema = z.object({
  description: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  incidentDate: z.string().optional(),
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

reportsRouter.post("/", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = reportSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { description, latitude, longitude, incidentDate } = parsed.data;

  const incidentDateObj = incidentDate ? new Date(incidentDate) : undefined;

  const geohash = generateGeohash(latitude, longitude);

  let analysis: Awaited<ReturnType<typeof analyzeReport>>;
  try {
    analysis = await analyzeReport(description, incidentDateObj);
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

      const report = await prisma.report.create({
        data: {
          userId: session.user.id,
          title: analysis.summary,
          description,
          latitude,
          longitude,
          aiSummary: analysis.summary,
          category,
          severity: analysis.severity,
          geohash,
          incidentDate: incidentDateObj,
        },
      });

      await prisma.$executeRaw`UPDATE "report" SET "embedding" = ${vectorLiteral}::vector WHERE "id" = ${report.id}`;
      await refreshRiskScore(geohash);
      return c.json(report);
    }
  } catch (error) {
    console.error("Gemini embedding failed, falling back to insert:", error);
  }

  const report = await prisma.report.create({
    data: {
      userId: session.user.id,
      title: analysis.summary,
      description,
      latitude,
      longitude,
      aiSummary: analysis.summary,
      category,
      severity: analysis.severity,
      geohash,
      incidentDate: incidentDateObj,
    },
  });

  await refreshRiskScore(geohash);
  return c.json(report);
});

reportsRouter.get("/", async (c) => {
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
  });
  return c.json(reports);
});

export default reportsRouter;

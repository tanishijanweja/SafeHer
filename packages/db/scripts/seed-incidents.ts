import path from "node:path";

import dotenv from "dotenv";
import ngeohash from "ngeohash";

import { SEED_INCIDENTS, type SeedIncident } from "../data/seed-incidents";

dotenv.config({ path: path.join(import.meta.dir, "../../../apps/server/.env") });

const { default: prisma } = await import("../src/index");
const { recomputeRiskForGeohashes } = await import("../src/recompute-risk");
const { NEWS_WINDOW_DAYS } = await import("../src/news-scoring");

const GEOHASH_PRECISION = 6;
const SEED_USER_ID = "seed-system-user";
const SEED_USER_EMAIL = "seed@safeher.local";

const CATEGORY_TO_REPORT: Record<
  SeedIncident["category"],
  "HARASSMENT" | "ASSAULT" | "UNSAFE_AREA" | "SUSPICIOUS_ACTIVITY" | "OTHER"
> = {
  harassment: "HARASSMENT",
  stalking: "SUSPICIOUS_ACTIVITY",
  unsafe_transport: "UNSAFE_AREA",
  poor_lighting: "UNSAFE_AREA",
  other: "OTHER",
};

const CATEGORY_TO_NEWS: Record<SeedIncident["category"], string> = {
  harassment: "harassment",
  stalking: "harassment",
  unsafe_transport: "other_crime",
  poor_lighting: "other_crime",
  other: "other_crime",
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function sourceDomain(source: string): string {
  const m = source.match(/([A-Za-z0-9.-]+\.[a-z]{2,})/i);
  if (m?.[1]) return m[1].toLowerCase();
  return "seed.safeher.local";
}

async function ensureSeedUser(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: SEED_USER_EMAIL } });
  if (existing) return existing.id;

  await prisma.user.create({
    data: {
      id: SEED_USER_ID,
      name: "SafeHer Seed Data",
      email: SEED_USER_EMAIL,
      emailVerified: true,
    },
  });
  return SEED_USER_ID;
}

async function main() {
  const userId = await ensureSeedUser();
  const touched = new Set<string>();
  const now = Date.now();
  const newsCutoffMs = NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const liveWindowMs = 30 * 24 * 60 * 60 * 1000;

  let newsInserted = 0;
  let newsSkipped = 0;
  let reportsInserted = 0;
  let reportsSkipped = 0;
  let historicalInserted = 0;

  console.log(`--- Seed incidents (${SEED_INCIDENTS.length}) ---`);

  const existingReports = await prisma.report.findMany({
    where: { userId },
    select: { title: true },
  });
  const reportTitles = new Set(existingReports.map((r) => r.title));

  for (let i = 0; i < SEED_INCIDENTS.length; i++) {
    const inc = SEED_INCIDENTS[i]!;
    const geohash = ngeohash.encode(inc.latitude, inc.longitude, GEOHASH_PRECISION);
    const publishedAt = new Date(inc.date);
    const url = `seed://safeher/${slugify(inc.title)}`;
    const ageMs = now - publishedAt.getTime();

    touched.add(geohash);

    const existingNews = await prisma.newsIncident.findUnique({ where: { url } });
    if (existingNews) {
      newsSkipped++;
    } else {
      await prisma.newsIncident.create({
        data: {
          title: inc.title,
          url,
          sourceDomain: sourceDomain(inc.source),
          latitude: inc.latitude,
          longitude: inc.longitude,
          geohash,
          publishedAt,
          category: CATEGORY_TO_NEWS[inc.category],
          severity: inc.severity,
          confidence: 0.9,
          isWomenSafety: true,
          localityName: null,
          affectsHeatmap: true,
          dedupeKey: `seed:${slugify(inc.title)}`,
        },
      });
      newsInserted++;
      console.log(`  news: ${inc.title} (${geohash})`);
    }

    // Live layer: keep seed reports inside the 30-day window so they paint heatmap
    if (!reportTitles.has(inc.title)) {
      const liveCreatedAt =
        ageMs <= liveWindowMs && ageMs >= 0
          ? publishedAt
          : new Date(now - Math.min((i + 1) * 3 * 24 * 60 * 60 * 1000, liveWindowMs - 86_400_000));

      await prisma.report.create({
        data: {
          userId,
          title: inc.title,
          description: `${inc.description}\n\nSource: ${inc.source}`,
          category: CATEGORY_TO_REPORT[inc.category],
          severity: Math.min(Math.max(inc.severity, 1), 5),
          latitude: inc.latitude,
          longitude: inc.longitude,
          geohash,
          isSpam: false,
          confidenceLevel: "COMMUNITY_CORROBORATED",
          createdAt: liveCreatedAt,
        },
      });
      reportTitles.add(inc.title);
      reportsInserted++;
      console.log(`  report: ${inc.title} (${geohash})`);
    } else {
      reportsSkipped++;
    }

    // Older than news window: also pin as historical point risk
    if (ageMs > newsCutoffMs) {
      const existingHist = await prisma.historicalRisk.findFirst({
        where: { geohash, source: "SEED" },
      });
      if (!existingHist) {
        const score = Number((Math.min(Math.max(inc.severity, 1), 5) / 5).toFixed(4));
        await prisma.historicalRisk.create({
          data: {
            district: inc.title.slice(0, 80),
            geohash,
            crimeCount: 1,
            score,
            source: "SEED",
          },
        });
        historicalInserted++;
        console.log(`  historical pin: ${inc.title} score=${score}`);
      }
    }
  }

  if (touched.size > 0) {
    console.log(`\nRecomputing RiskScore for ${touched.size} geohashes...`);
    await recomputeRiskForGeohashes(prisma, touched);
  }

  console.log(
    `\nDone: news ${newsInserted} inserted/${newsSkipped} skipped; ` +
      `reports ${reportsInserted} inserted/${reportsSkipped} skipped; ` +
      `historical pins ${historicalInserted}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

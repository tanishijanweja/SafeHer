import { execSync } from "node:child_process";
import path from "node:path";

import dotenv from "dotenv";
import ngeohash from "ngeohash";

import { classifyNewsHeadline } from "./classify-news";
import {
  inDelhiBbox,
  isBlockedTitle,
  isNearCityCentroid,
  makeDedupeKey,
  matchGazetteer,
  titleSimilarity,
} from "./news-filters";
import { recomputeRiskForGeohashes } from "./recompute-risk";

dotenv.config({ path: path.join(import.meta.dir, "../../../apps/server/.env") });

const { default: prisma } = await import("./index");

const GEOHASH_PRECISION = 6;
const NOMINATIM_DELAY_MS = 1050;
const NOMINATIM_USER_AGENT = "SafeHer/1.0 (https://github.com)";
const MIN_CLASSIFY_CONFIDENCE = 0.55;
const GEMINI_DELAY_MS = 200;

function generateGeohash(lat: number, lng: number): string {
  return ngeohash.encode(lat, lng, GEOHASH_PRECISION);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function nominatimGeocodeLocality(
  locality: string,
): Promise<{ lat: number; lng: number } | null> {
  // Only geocode a short locality string — never the full headline
  const query = encodeURIComponent(`${locality}, Delhi, India`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=jsonv2&limit=1&viewbox=76.9,28.9,77.35,28.4&bounded=1`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT },
    });
    const data = (await res.json()) as { lat?: string; lon?: string }[];
    if (!Array.isArray(data) || data.length === 0) return null;

    const first = data[0];
    if (!first) return null;

    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (!inDelhiBbox(lat, lng)) return null;
    if (isNearCityCentroid(lat, lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}

interface GdeltArticle {
  title: string;
  url: string;
  domain: string;
  seendate: string;
}

interface GdeltResponse {
  articles: GdeltArticle[];
}

function fetchGdeltArticles(timespan: string, maxrecords: number): GdeltArticle[] {
  const keywords = [
    "rape",
    '"sexual assault"',
    "molestation",
    "harassment",
    '"violence against women"',
    '"eve teasing"',
    "stalking",
    '"domestic violence"',
    '"acid attack"',
    "dowry",
    "murder",
    "kidnapped",
    '"chain snatching"',
    "robbery",
  ];

  const keywordQuery = `(${keywords.join(" OR ")})`;
  const query = `sourcecountry:india (Delhi OR "New Delhi") ${keywordQuery}`;

  const params = new URLSearchParams({
    query,
    mode: "artlist",
    format: "json",
    maxrecords: String(maxrecords),
    timespan,
    sort: "datedesc",
  });

  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;

  console.log("Fetching GDelt Doc API (via curl)...");

  try {
    const raw = execSync(`curl -s -w "\\n%{http_code}" --max-time 30 "${url.replace(/"/g, '\\"')}"`, {
      encoding: "utf-8",
      timeout: 35000,
    });

    const lines = raw.trimEnd().split("\n");
    const httpCode = Number(lines.pop() ?? "0");
    const body = lines.join("\n");

    if (httpCode !== 200) {
      console.error(`  HTTP ${httpCode}: ${body.slice(0, 300)}`);
      return [];
    }

    const data = JSON.parse(body) as GdeltResponse;
    if (!data.articles || !Array.isArray(data.articles)) {
      console.log("  No articles found");
      return [];
    }

    console.log(`  Got ${data.articles.length} articles`);
    return data.articles;
  } catch (error) {
    console.error(`  Failed: ${String(error).slice(0, 300)}`);
    return [];
  }
}

async function main() {
  console.log("=== GDelt Doc API News Incident Fetcher (filtered) ===\n");

  console.log("Waiting 6s for GDelt rate limit cooldown...");
  await sleep(6000);

  const existing = await prisma.newsIncident.findMany({
    select: { url: true, dedupeKey: true, title: true, publishedAt: true },
  });
  const existingUrls = new Set(existing.map((r) => r.url));
  const existingDedupe = new Set(existing.map((r) => r.dedupeKey).filter(Boolean) as string[]);
  const recentTitles = existing
    .filter((r) => Date.now() - r.publishedAt.getTime() < 72 * 60 * 60 * 1000)
    .map((r) => r.title);

  console.log(`Existing news incidents in DB: ${existingUrls.size}`);

  const articles = fetchGdeltArticles("3months", 250);
  console.log(`Fetched ${articles.length} articles from GDelt\n`);

  let inserted = 0;
  let skipped = 0;
  let rejected = 0;
  let noLocation = 0;
  let deduped = 0;
  const touchedGeohashes = new Set<string>();

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    if (!article) continue;

    if (existingUrls.has(article.url)) {
      skipped++;
      continue;
    }

    if (isBlockedTitle(article.title)) {
      rejected++;
      continue;
    }

    console.log(`[${i + 1}/${articles.length}] ${article.title.slice(0, 80)}`);

    const publishedAt = new Date(article.seendate);
    const dedupeKey = makeDedupeKey(article.title, publishedAt);

    if (existingDedupe.has(dedupeKey)) {
      console.log("  -> syndicate/dedupe skip");
      deduped++;
      continue;
    }
    if (recentTitles.some((t) => titleSimilarity(t, article.title) >= 0.72)) {
      console.log("  -> near-duplicate title skip");
      deduped++;
      continue;
    }

    await sleep(GEMINI_DELAY_MS);
    const classification = await classifyNewsHeadline(article.title, article.domain);

    if (!classification.isIncident || classification.confidence < MIN_CLASSIFY_CONFIDENCE) {
      console.log(`  -> rejected by classifier (${classification.reason || classification.category})`);
      rejected++;
      continue;
    }

    // Locality: gazetteer from title → Gemini locality → Nominatim on locality only
    let locName = "unknown";
    let lat: number | null = null;
    let lng: number | null = null;
    let affectsHeatmap = true;

    const fromTitle = matchGazetteer(article.title);
    if (fromTitle) {
      locName = fromTitle.name;
      lat = fromTitle.lat;
      lng = fromTitle.lng;
    } else if (classification.locality) {
      const gaz = matchGazetteer(classification.locality);
      if (gaz) {
        locName = gaz.name;
        lat = gaz.lat;
        lng = gaz.lng;
      } else {
        console.log(`  -> Nominatim for locality "${classification.locality}"...`);
        await sleep(NOMINATIM_DELAY_MS);
        const coords = await nominatimGeocodeLocality(classification.locality);
        if (coords) {
          locName = classification.locality;
          lat = coords.lat;
          lng = coords.lng;
        }
      }
    }

    if (lat === null || lng === null) {
      // No specific locality — do not invent Delhi centroid
      console.log("  -> no specific Delhi locality, skipping heatmap insert");
      noLocation++;
      continue;
    }

    if (isNearCityCentroid(lat, lng)) {
      console.log("  -> city centroid only, skipping heatmap influence");
      noLocation++;
      continue;
    }

    const geohash = generateGeohash(lat, lng);

    await prisma.newsIncident.create({
      data: {
        title: article.title,
        url: article.url,
        sourceDomain: article.domain,
        latitude: lat,
        longitude: lng,
        geohash,
        publishedAt,
        category: classification.category,
        severity: classification.severity,
        confidence: classification.confidence,
        isWomenSafety: classification.isWomenSafety,
        localityName: locName,
        affectsHeatmap,
        dedupeKey,
      },
    });

    console.log(
      `  -> inserted (${locName}: ${lat}, ${lng}, sev=${classification.severity}, conf=${classification.confidence.toFixed(2)})`,
    );
    inserted++;
    existingUrls.add(article.url);
    existingDedupe.add(dedupeKey);
    recentTitles.push(article.title);
    if (affectsHeatmap) touchedGeohashes.add(geohash);
  }

  console.log(
    `\nDone: ${inserted} inserted, ${skipped} url-dupes, ${deduped} syndicated, ${rejected} rejected, ${noLocation} no locality`,
  );

  if (touchedGeohashes.size > 0) {
    console.log(`Recomputing RiskScore for ${touchedGeohashes.size} geohashes...`);
    const n = await recomputeRiskForGeohashes(prisma, touchedGeohashes);
    console.log(`Updated ${n} risk cells`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

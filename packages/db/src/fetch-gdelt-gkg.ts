/**
 * Production GDELT GKG ingest
 *
 * Modes:
 *   incremental (default) — only unprocessed files since last watermark (or last 6h)
 *   backfill              — GKG_BACKFILL_DAYS (default 180) historical import, resumable
 *
 * Env:
 *   GKG_MODE=incremental|backfill
 *   GKG_BACKFILL_DAYS=180
 *   GKG_CONCURRENCY=3
 *   GKG_CLASSIFY_CONCURRENCY=4
 *   GKG_FORCE=1  — reprocess files even if watermarked
 */
import { execSync } from "node:child_process";
import {
  writeFileSync,
  unlinkSync,
  mkdtempSync,
  rmdirSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import dotenv from "dotenv";
import ngeohash from "ngeohash";

import { classifyNewsHeadline, fallbackFromTitle, type NewsClassification } from "./classify-news";
import {
  evaluateArticle,
  makeDedupeKey,
  matchGazetteer,
  titleSimilarity,
  type ResolvedLocality,
} from "./news-filters";
import { recomputeRiskForGeohashes } from "./recompute-risk";

dotenv.config({ path: path.join(import.meta.dir, "../../../apps/server/.env") });

const { default: prisma } = await import("./index");

const GEOHASH_PRECISION = 6;
const GKG_BASE = "http://data.gdeltproject.org/gdeltv2";
const MIN_CLASSIFY_CONFIDENCE = 0.5;
const PENDING_PATH = path.join(import.meta.dir, "../data/pending-news.json");

const MODE = (process.env.GKG_MODE ?? "incremental").toLowerCase();
const BACKFILL_DAYS = Number(process.env.GKG_BACKFILL_DAYS ?? "180");
const FILE_CONCURRENCY = Math.max(1, Number(process.env.GKG_CONCURRENCY ?? "3"));
const CLASSIFY_CONCURRENCY = Math.max(1, Number(process.env.GKG_CLASSIFY_CONCURRENCY ?? "4"));
const FORCE = process.env.GKG_FORCE === "1";
const INSERT_BATCH = 25;

function generateGeohash(lat: number, lng: number): string {
  return ngeohash.encode(lat, lng, GEOHASH_PRECISION);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fileIdFromUrl(url: string): string {
  return url.split("/").pop() ?? url;
}

function timestampFromFileId(fileId: string): Date | null {
  const m = fileId.match(/^(\d{14})\.gkg\.csv\.zip$/);
  if (!m?.[1]) return null;
  const s = m[1];
  return new Date(
    `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`,
  );
}

function generateGkgUrls(from: Date, to: Date): string[] {
  const urls: string[] = [];
  const current = new Date(from);
  current.setUTCSeconds(0, 0);
  current.setUTCMinutes(Math.floor(current.getUTCMinutes() / 15) * 15);

  while (current <= to) {
    const y = String(current.getUTCFullYear());
    const m = String(current.getUTCMonth() + 1).padStart(2, "0");
    const d = String(current.getUTCDate()).padStart(2, "0");
    const h = String(current.getUTCHours()).padStart(2, "0");
    const min = String(current.getUTCMinutes()).padStart(2, "0");
    const timestamp = `${y}${m}${d}${h}${min}00`;
    urls.push(`${GKG_BASE}/${timestamp}.gkg.csv.zip`);
    current.setUTCMinutes(current.getUTCMinutes() + 15);
  }
  return urls;
}

interface GdeltGkgRow {
  url: string;
  domain: string;
  themes: string;
  locations: string;
  title: string;
  date: string;
}

interface Candidate extends GdeltGkgRow {
  locality: ResolvedLocality;
  displayTitle: string;
  fileId: string;
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const raw = parts[i] ?? "";
      if (/^\d{4,}$/.test(raw)) continue;
      const cleaned = decodeURIComponent(raw)
        .replace(/\.\w+$/, "")
        .replace(/[-_+/]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned.length >= 8) return cleaned;
    }
    const joined = parts
      .slice(-2)
      .map((p) => decodeURIComponent(p).replace(/[-_+/]+/g, " "))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (joined.length >= 8) return joined;
  } catch {
    /* ignore */
  }
  return "";
}

function parseGkgLine(line: string): GdeltGkgRow | null {
  const cols = line.split("\t");
  if (cols.length < 11) return null;

  const date = cols[1] ?? "";
  const domain = cols[3] ?? "";
  const url = cols[4] ?? "";
  const themes = (cols[8] || cols[7] || "").trim();
  const locations = (cols[10] || cols[9] || "").trim();

  if (!url || !url.startsWith("http")) return null;

  return { url, domain, themes, locations, title: titleFromUrl(url), date };
}

function parsePublishedAt(date: string): Date {
  if (date.length >= 12) {
    return new Date(
      `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(8, 10)}:${date.slice(10, 12)}:00Z`,
    );
  }
  return new Date();
}

function downloadZip(url: string, destFile: string): "ok" | "missing" | "error" {
  try {
    execSync(`curl -fsSL --max-time 40 -o "${destFile}" "${url}"`, {
      encoding: "utf-8",
      timeout: 45000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return readFileSync(destFile).byteLength > 100 ? "ok" : "missing";
  } catch (e) {
    const msg = String(e);
    if (msg.includes("404") || msg.includes("22")) return "missing";
    return "error";
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

interface FileResult {
  fileId: string;
  status: "ok" | "empty" | "missing" | "failed";
  parsed: number;
  candidates: Candidate[];
  error?: string;
}

function processArchive(url: string): FileResult {
  const fileId = fileIdFromUrl(url);
  const tmpDir = mkdtempSync(path.join(tmpdir(), "gdelt-"));
  const tmpFile = path.join(tmpDir, "data.zip");

  try {
    const dl = downloadZip(url, tmpFile);
    if (dl === "missing") {
      return { fileId, status: "missing", parsed: 0, candidates: [] };
    }
    if (dl === "error") {
      return { fileId, status: "failed", parsed: 0, candidates: [], error: "download_error" };
    }

    let text: string;
    try {
      text = execSync(`unzip -p "${tmpFile}"`, {
        encoding: "utf-8",
        maxBuffer: 500 * 1024 * 1024,
        timeout: 30000,
      });
    } catch {
      return { fileId, status: "failed", parsed: 0, candidates: [], error: "unzip_failed" };
    }

    let parsed = 0;
    const candidates: Candidate[] = [];

    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const row = parseGkgLine(line);
      if (!row) continue;
      parsed++;

      const displayTitle = row.title || row.url;
      const decision = evaluateArticle(row.title, row.url, row.themes, row.locations);
      if (decision.reason !== "pass" || !decision.locality) continue;

      candidates.push({
        ...row,
        locality: decision.locality,
        displayTitle,
        fileId,
      });
    }

    return {
      fileId,
      status: candidates.length === 0 ? "empty" : "ok",
      parsed,
      candidates,
    };
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
    try {
      rmdirSync(tmpDir);
    } catch {
      /* ignore */
    }
  }
}

async function markFile(
  fileId: string,
  status: string,
  parsed: number,
  candidates: number,
  inserted: number,
  error?: string,
) {
  await prisma.gkgIngestFile.upsert({
    where: { fileId },
    create: {
      fileId,
      status,
      parsed,
      candidates,
      inserted,
      error: error ?? null,
      processedAt: new Date(),
    },
    update: {
      status,
      parsed,
      candidates,
      inserted,
      error: error ?? null,
      processedAt: new Date(),
    },
  });
}

interface PendingItem {
  url: string;
  domain: string;
  title: string;
  themes: string;
  locations: string;
  date: string;
  locality: ResolvedLocality;
  error: string;
  queuedAt: string;
}

function loadPending(): PendingItem[] {
  try {
    if (!existsSync(PENDING_PATH)) return [];
    return JSON.parse(readFileSync(PENDING_PATH, "utf-8")) as PendingItem[];
  } catch {
    return [];
  }
}

function savePending(items: PendingItem[]) {
  const dir = path.dirname(PENDING_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const byUrl = new Map(items.map((i) => [i.url, i]));
  writeFileSync(PENDING_PATH, JSON.stringify([...byUrl.values()], null, 2));
}

interface InsertRow {
  title: string;
  url: string;
  sourceDomain: string;
  latitude: number;
  longitude: number;
  geohash: string;
  publishedAt: Date;
  category: string;
  severity: number;
  confidence: number;
  isWomenSafety: boolean;
  localityName: string;
  affectsHeatmap: boolean;
  dedupeKey: string;
}

async function classifyAndBuild(
  cand: Candidate,
  existingUrls: Set<string>,
  existingDedupe: Set<string>,
  recentTitles: string[],
): Promise<
  | { kind: "insert"; row: InsertRow }
  | { kind: "skip"; reason: "duplicate" | "gemini_rej" }
  | { kind: "pending"; item: PendingItem; fallback?: InsertRow }
> {
  if (existingUrls.has(cand.url)) return { kind: "skip", reason: "duplicate" };

  const publishedAt = parsePublishedAt(cand.date);
  const dedupeKey = makeDedupeKey(cand.displayTitle, publishedAt);

  if (existingDedupe.has(dedupeKey)) return { kind: "skip", reason: "duplicate" };
  if (recentTitles.some((t) => titleSimilarity(t, cand.displayTitle) >= 0.75)) {
    return { kind: "skip", reason: "duplicate" };
  }

  let locality = cand.locality;
  const outcome = await classifyNewsHeadline(cand.displayTitle, cand.domain);

  if (outcome.status === "api_failed") {
    const fb = fallbackFromTitle(cand.displayTitle);
    const pending: PendingItem = {
      url: cand.url,
      domain: cand.domain,
      title: cand.displayTitle,
      themes: cand.themes,
      locations: cand.locations,
      date: cand.date,
      locality,
      error: outcome.error,
      queuedAt: new Date().toISOString(),
    };

    if (fb.isIncident && fb.confidence >= MIN_CLASSIFY_CONFIDENCE) {
      return {
        kind: "pending",
        item: pending,
        fallback: toInsertRow(cand, locality, fb, publishedAt, dedupeKey),
      };
    }
    return { kind: "pending", item: pending };
  }

  const classification = outcome.classification;
  if (!classification.isIncident || classification.confidence < MIN_CLASSIFY_CONFIDENCE) {
    return { kind: "skip", reason: "gemini_rej" };
  }

  if (classification.locality) {
    const gaz = matchGazetteer(classification.locality);
    if (gaz) locality = { ...gaz, affectsHeatmap: true };
  }

  return {
    kind: "insert",
    row: toInsertRow(cand, locality, classification, publishedAt, dedupeKey),
  };
}

function toInsertRow(
  cand: Candidate,
  locality: ResolvedLocality,
  classification: NewsClassification,
  publishedAt: Date,
  dedupeKey: string,
): InsertRow {
  return {
    title: cand.displayTitle,
    url: cand.url,
    sourceDomain: cand.domain,
    latitude: locality.lat,
    longitude: locality.lng,
    geohash: generateGeohash(locality.lat, locality.lng),
    publishedAt,
    category: classification.category,
    severity: classification.severity,
    confidence: classification.confidence,
    isWomenSafety: classification.isWomenSafety,
    localityName: locality.name,
    affectsHeatmap: locality.affectsHeatmap,
    dedupeKey,
  };
}

async function batchInsert(rows: InsertRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const chunk = rows.slice(i, i + INSERT_BATCH);
    try {
      const res = await prisma.newsIncident.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      inserted += res.count;
    } catch {
      // Fallback one-by-one if createMany fails
      for (const row of chunk) {
        try {
          await prisma.newsIncident.create({ data: row });
          inserted++;
        } catch {
          /* duplicate */
        }
      }
    }
  }
  return inserted;
}

async function resolveUrlRange(): Promise<string[]> {
  const now = new Date();

  if (MODE === "backfill") {
    const start = new Date(now.getTime() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);
    console.log(`Mode: BACKFILL (${BACKFILL_DAYS} days) from ${start.toISOString()}`);
    return generateGkgUrls(start, now);
  }

  // Incremental: from last successful watermark (minus 1 file) or last 6 hours
  const last = await prisma.gkgIngestFile.findFirst({
    where: { status: { in: ["ok", "empty", "missing"] } },
    orderBy: { fileId: "desc" },
  });

  let start: Date;
  if (last) {
    const ts = timestampFromFileId(last.fileId);
    start = ts ?? new Date(now.getTime() - 6 * 60 * 60 * 1000);
    // Re-check last few hours for late-arriving files
    start = new Date(start.getTime() - 2 * 60 * 60 * 1000);
    console.log(`Mode: INCREMENTAL from ${start.toISOString()} (after ${last.fileId})`);
  } else {
    start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    console.log(`Mode: INCREMENTAL (no watermark) last 6h from ${start.toISOString()}`);
  }

  return generateGkgUrls(start, now);
}

async function main() {
  console.log("=== GDELT GKG Production Ingest ===\n");
  console.log(`Base: ${GKG_BASE}`);
  console.log(`File concurrency: ${FILE_CONCURRENCY} | Classify concurrency: ${CLASSIFY_CONCURRENCY}`);
  console.log(`Force reprocess: ${FORCE}\n`);

  const allUrls = await resolveUrlRange();
  console.log(`Candidate archives in range: ${allUrls.length}`);

  let urls = allUrls;
  if (!FORCE) {
    const done = await prisma.gkgIngestFile.findMany({
      where: {
        fileId: { in: allUrls.map(fileIdFromUrl) },
        status: { in: ["ok", "empty", "missing"] },
      },
      select: { fileId: true },
    });
    const doneSet = new Set(done.map((d) => d.fileId));
    urls = allUrls.filter((u) => !doneSet.has(fileIdFromUrl(u)));
    console.log(`Already processed (skip): ${doneSet.size}`);
    console.log(`To process: ${urls.length}\n`);
  } else {
    console.log(`FORCE=1 — reprocessing all ${urls.length} files\n`);
  }

  if (urls.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const existing = await prisma.newsIncident.findMany({
    select: { url: true, dedupeKey: true, title: true, publishedAt: true },
  });
  const existingUrls = new Set(existing.map((r) => r.url));
  const existingDedupe = new Set(
    existing.map((r) => r.dedupeKey).filter(Boolean) as string[],
  );
  const recentTitles = existing
    .filter((r) => Date.now() - r.publishedAt.getTime() < 14 * 24 * 60 * 60 * 1000)
    .map((r) => r.title);

  console.log(`Existing NewsIncident rows: ${existingUrls.size}\n`);

  const pending = loadPending();
  const touchedGeohashes = new Set<string>();

  const totals = {
    filesOk: 0,
    filesEmpty: 0,
    filesMissing: 0,
    filesFailed: 0,
    parsed: 0,
    candidates: 0,
    inserted: 0,
    duplicates: 0,
    geminiRej: 0,
    geminiFailed: 0,
  };

  const started = Date.now();
  let processedFiles = 0;

  // Process in chunks of FILE_CONCURRENCY
  for (let offset = 0; offset < urls.length; offset += FILE_CONCURRENCY) {
    const batch = urls.slice(offset, offset + FILE_CONCURRENCY);
    const results = await mapPool(batch, FILE_CONCURRENCY, async (url) => processArchive(url));

    for (const result of results) {
      processedFiles++;
      totals.parsed += result.parsed;
      totals.candidates += result.candidates.length;

      if (result.status === "missing") {
        totals.filesMissing++;
        await markFile(result.fileId, "missing", 0, 0, 0);
        continue;
      }
      if (result.status === "failed") {
        totals.filesFailed++;
        await markFile(result.fileId, "failed", result.parsed, 0, 0, result.error);
        continue;
      }
      if (result.candidates.length === 0) {
        totals.filesEmpty++;
        await markFile(result.fileId, "empty", result.parsed, 0, 0);
        continue;
      }

      totals.filesOk++;

      // Classify candidates with limited concurrency
      const classified = await mapPool(
        result.candidates,
        CLASSIFY_CONCURRENCY,
        async (cand) => classifyAndBuild(cand, existingUrls, existingDedupe, recentTitles),
      );

      const toInsert: InsertRow[] = [];
      let fileDup = 0;
      let fileRej = 0;
      let fileFail = 0;

      for (const c of classified) {
        if (c.kind === "skip") {
          if (c.reason === "duplicate") {
            fileDup++;
            totals.duplicates++;
          } else {
            fileRej++;
            totals.geminiRej++;
          }
          continue;
        }
        if (c.kind === "pending") {
          fileFail++;
          totals.geminiFailed++;
          pending.push(c.item);
          if (c.fallback) toInsert.push(c.fallback);
          continue;
        }
        toInsert.push(c.row);
      }

      // Dedup within batch
      const uniqueRows: InsertRow[] = [];
      for (const row of toInsert) {
        if (existingUrls.has(row.url) || existingDedupe.has(row.dedupeKey)) {
          fileDup++;
          totals.duplicates++;
          continue;
        }
        existingUrls.add(row.url);
        existingDedupe.add(row.dedupeKey);
        recentTitles.push(row.title);
        uniqueRows.push(row);
        if (row.affectsHeatmap) touchedGeohashes.add(row.geohash);
      }

      const inserted = await batchInsert(uniqueRows);
      totals.inserted += inserted;

      await markFile(
        result.fileId,
        "ok",
        result.parsed,
        result.candidates.length,
        inserted,
      );

      const pct = ((processedFiles / urls.length) * 100).toFixed(1);
      const elapsed = ((Date.now() - started) / 1000).toFixed(0);
      console.log(
        `[${processedFiles}/${urls.length} ${pct}% ${elapsed}s] ${result.fileId} parsed=${result.parsed} cand=${result.candidates.length} ins=${inserted} dup=${fileDup} rej=${fileRej} fail=${fileFail}`,
      );
    }

    // Persist pending periodically
    if (processedFiles % 50 < FILE_CONCURRENCY) {
      savePending(pending);
    }
  }

  savePending(pending);

  const elapsedMin = ((Date.now() - started) / 60000).toFixed(1);

  console.log("\n========== INGEST SUMMARY ==========");
  console.log(`Mode:                 ${MODE}`);
  console.log(`Elapsed:              ${elapsedMin} min`);
  console.log(`Files OK/empty/miss/fail: ${totals.filesOk}/${totals.filesEmpty}/${totals.filesMissing}/${totals.filesFailed}`);
  console.log(`Rows parsed:          ${totals.parsed}`);
  console.log(`Candidates:           ${totals.candidates}`);
  console.log(`Inserted:             ${totals.inserted}`);
  console.log(`Duplicates:           ${totals.duplicates}`);
  console.log(`Gemini rejected:      ${totals.geminiRej}`);
  console.log(`Gemini failed:        ${totals.geminiFailed}`);
  console.log(`Pending queue:        ${pending.length}`);
  console.log("====================================\n");

  if (touchedGeohashes.size > 0) {
    console.log(`Recomputing RiskScore for ${touchedGeohashes.size} geohashes...`);
    const n = await recomputeRiskForGeohashes(prisma, touchedGeohashes);
    console.log(`Updated ${n} risk cells`);
  } else {
    console.log("No heatmap geohashes to recompute");
  }

  console.log("\nDone.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

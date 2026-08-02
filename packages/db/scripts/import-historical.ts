import { readFileSync } from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import ngeohash from "ngeohash";

dotenv.config({ path: path.join(import.meta.dir, "../../../apps/server/.env") });

const { default: prisma } = await import("../src/index");

const CSV_FILE = path.join(import.meta.dir, "../data/ncrb-crimes.csv");
const GEOHASH_PRECISION = 6;
const NOMINATIM_DELAY_MS = 1050;
const NOMINATIM_USER_AGENT = "SafeHer/1.0 (https://github.com)";

function generateGeohash(lat: number, lng: number): string {
  return ngeohash.encode(lat, lng, GEOHASH_PRECISION);
}

interface CsvRow {
  district: string;
  crimeCount: number;
}

function parseCsv(content: string): CsvRow[] {
  const rows: CsvRow[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const commaIdx = line.indexOf(",");
    if (commaIdx === -1) continue;

    const district = line.slice(0, commaIdx).trim();
    const countStr = line.slice(commaIdx + 1).trim();
    const crimeCount = Number(countStr);

    if (!district || !Number.isFinite(crimeCount)) continue;

    rows.push({ district, crimeCount });
  }

  return rows;
}

async function geocode(district: string): Promise<{ lat: number; lng: number } | null> {
  const query = encodeURIComponent(`${district},Delhi,India`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=jsonv2&limit=1`;

  const res = await fetch(url, {
    headers: { "User-Agent": NOMINATIM_USER_AGENT },
  });

  const data = (await res.json()) as { lat?: string; lon?: string }[];

  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0];
  if (first === undefined) return null;

  const lat = Number(first.lat);
  const lng = Number(first.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const content = readFileSync(CSV_FILE, "utf-8");
  const rows = parseCsv(content);

  if (rows.length === 0) {
    console.error(`No valid rows found in ${CSV_FILE}`);
    process.exit(1);
  }

  const maxCrimeCount = Math.max(...rows.map((r) => r.crimeCount));

  const existing = await prisma.historicalRisk.findMany({ select: { geohash: true } });
  const seen = new Set(existing.map((r) => r.geohash));

  let inserted = 0;
  let skipped = 0;
  let geocodeFailed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;

    console.log(`[${i + 1}/${rows.length}] Geocoding: ${row.district}...`);

    const coords = await geocode(row.district);

    if (!coords) {
      console.log("  -> nominatim returned no results, skipping");
      geocodeFailed++;
      continue;
    }

    const geohash = generateGeohash(coords.lat, coords.lng);

    if (seen.has(geohash)) {
      console.log(`  -> geohash ${geohash} already exists, skipping`);
      skipped++;
      continue;
    }

    seen.add(geohash);

    const score = Number((row.crimeCount / maxCrimeCount).toFixed(4));

    await prisma.historicalRisk.create({
      data: {
        district: row.district,
        geohash,
        crimeCount: row.crimeCount,
        score,
        source: "NCRB",
      },
    });

    console.log(`  -> inserted (${coords.lat},${coords.lng} -> geohash=${geohash}, score=${score})`);
    inserted++;

    if (i < rows.length - 1) {
      await sleep(NOMINATIM_DELAY_MS);
    }
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped, ${geocodeFailed} geocode failures`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

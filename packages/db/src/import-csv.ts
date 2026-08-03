import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import ngeohash from "ngeohash";

dotenv.config({ path: path.join(import.meta.dir, "../../../apps/server/.env") });

const { default: prisma } = await import("./index");

const DATA_FILE = path.join(import.meta.dir, "../data/delhi-crime.csv");
const GEOHASH_PRECISION = 6;

type CsvRow = {
  district: string;
  lat: number;
  lng: number;
  crimeCount: number;
};

function splitLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (const ch of line) {
    if (inQuotes) {
      if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cols.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

function parseCsv(content: string): CsvRow[] {
  const rows: CsvRow[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const cols = splitLine(line);
    const [districtRaw, latRaw, lngRaw, countRaw] = cols;
    if (districtRaw === undefined || latRaw === undefined || lngRaw === undefined || countRaw === undefined) {
      continue;
    }

    const district = districtRaw.trim();
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    const crimeCount = Number(countRaw);

    if (!district || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(crimeCount)) {
      continue;
    }

    rows.push({ district, lat, lng, crimeCount });
  }

  return rows;
}

async function main() {
  if (!existsSync(DATA_FILE)) {
    console.error(`CSV not found at ${DATA_FILE}`);
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(DATA_FILE, "utf-8"));
  if (rows.length === 0) {
    console.error("No valid rows found in CSV");
    process.exit(1);
  }

  const existing = await prisma.historicalRisk.findMany({ select: { geohash: true } });
  const seen = new Set(existing.map((row) => row.geohash));

  const maxCount = Math.max(...rows.map((row) => row.crimeCount));
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const geohash = ngeohash.encode(row.lat, row.lng, GEOHASH_PRECISION);
    if (seen.has(geohash)) {
      skipped++;
      continue;
    }
    seen.add(geohash);

    const score = Number((row.crimeCount / maxCount).toFixed(4));

    await prisma.historicalRisk.create({
      data: {
        district: row.district,
        geohash,
        crimeCount: row.crimeCount,
        score,
        source: "NCRB",
      },
    });

    inserted++;
  }

  console.log(`Imported ${inserted} rows, skipped ${skipped} duplicates.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

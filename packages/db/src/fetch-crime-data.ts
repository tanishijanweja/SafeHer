import { writeFileSync } from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: path.join(import.meta.dir, "../../../apps/server/.env") });

const RESOURCE_ID = "a7c80974-6e60-4ecb-b07f-4cec770f8cf1";
const TOTAL_COL = "total_crime_against_women__ipc_sll____col____54_";

const DELHI_DISTRICT_COORDS: Record<string, { lat: number; lng: number }> = {
  "New Delhi": { lat: 28.614, lng: 77.209 },
  Central: { lat: 28.646, lng: 77.21 },
  North: { lat: 28.767, lng: 77.096 },
  "North-East": { lat: 28.707, lng: 77.282 },
  "North-West": { lat: 28.709, lng: 77.08 },
  East: { lat: 28.642, lng: 77.286 },
  West: { lat: 28.641, lng: 77.104 },
  South: { lat: 28.536, lng: 77.212 },
  "South-East": { lat: 28.562, lng: 77.252 },
  "South-West": { lat: 28.583, lng: 77.03 },
  Dwarka: { lat: 28.597, lng: 77.048 },
  Outer: { lat: 28.8, lng: 77.055 },
  "Outer North": { lat: 28.81, lng: 77.17 },
  Rohini: { lat: 28.734, lng: 77.075 },
  Shahdara: { lat: 28.69, lng: 77.291 },
  "IGI Airport": { lat: 28.556, lng: 77.1 },
};

type ApiRecord = {
  state_ut?: unknown;
  district?: unknown;
  [key: string]: unknown;
};

async function fetchAll(): Promise<ApiRecord[]> {
  const all: ApiRecord[] = [];
  let offset = 0;

  for (;;) {
    const url = `https://api.data.gov.in/resource/${RESOURCE_ID}?api-key=${process.env.DATA_GOV_API_KEY}&format=json&limit=1000&offset=${offset}`;
    const res = await fetch(url);
    const data = (await res.json()) as { records: ApiRecord[] };
    all.push(...data.records);
    if (data.records.length < 1000) break;
    offset += data.records.length;
  }

  return all;
}

const OUT = path.join(import.meta.dir, "../data/delhi-crime.csv");

async function main() {
  if (!process.env.DATA_GOV_API_KEY) {
    console.error("DATA_GOV_API_KEY not set in apps/server/.env");
    process.exit(1);
  }

  const records = await fetchAll();

  const rows: { district: string; lat: number; lng: number; crimeCount: number }[] = [];

  for (const record of records) {
    if (record.state_ut !== "Delhi") continue;
    const district = String(record.district ?? "");
    const coords = DELHI_DISTRICT_COORDS[district];
    if (!coords) continue;
    const crimeCount = Number(record[TOTAL_COL] ?? 0) || 0;
    rows.push({ district, ...coords, crimeCount });
  }

  rows.sort((a, b) => b.crimeCount - a.crimeCount);

  const csv = [
    "district,lat,lng,crimeCount",
    ...rows.map((r) => `${r.district},${r.lat},${r.lng},${r.crimeCount}`),
  ].join("\n");

  writeFileSync(OUT, `${csv}\n`);
  console.log(`Wrote ${rows.length} Delhi districts to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

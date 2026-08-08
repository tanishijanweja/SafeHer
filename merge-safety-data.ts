/**
 * Merges two data sources for police stations, hospitals, and fire stations:
 *
 * 1. The OSM files (delhi-police-stations-real.csv, etc.) — comprehensive
 *    locations (231 police, 889 hospitals, 41 fire), but sparse phone numbers.
 * 2. The manually-compiled files (delhi-police-stations-with-numbers.csv,
 *    etc.) — fewer entries (~66/63/19), but each one has a real phone number
 *    pulled from live business listings.
 *
 * STRATEGY: for every OSM entry missing a phone number, check if any
 * manually-compiled entry is within 150 meters. If so, that's almost
 * certainly the same physical place — borrow its phone number. Matching by
 * distance (not name) is used because the same place is often named
 * slightly differently between sources (e.g. "PS Karol Bagh" vs
 * "Police Station Karol Bagh").
 *
 * Run with: bun run merge-safety-data.ts
 * Produces: delhi-police-final.csv, delhi-hospitals-final.csv, delhi-fire-final.csv
 */

type Row = Record<string, string>;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dphi = toRad(lat2 - lat1);
  const dlambda = toRad(lon2 - lon1);
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function parseCSV(text: string): Row[] {
  // Strip Windows-style \r before splitting, so header/value names don't
  // end up with a stray carriage-return character stuck to the last column
  // (e.g. "phone\r" instead of "phone") — this was silently breaking every
  // lookup since manualRow.phone was always undefined.
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Row = {};
    headers.forEach((h, i) => (row[h] = values[i] ?? ""));
    return row;
  });
}

// Handles quoted fields containing commas
function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function toCSV(rows: Row[], headers: string[]): string {
  const escape = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

async function mergeDataset(
  osmFile: string,
  manualFile: string,
  outputFile: string,
  thresholdMeters = 250
) {
  const osmText = await Bun.file(osmFile).text();
  const manualText = await Bun.file(manualFile).text();

  const osmRows = parseCSV(osmText);
  const manualRows = parseCSV(manualText);

  console.log(`  Loaded ${osmRows.length} OSM rows, ${manualRows.length} manual rows`);
  console.log(`  Manual rows with phone: ${manualRows.filter((r) => r.phone?.trim()).length}`);
  if (manualRows.length > 0) {
    console.log(`  Sample manual row:`, JSON.stringify(manualRows[0]));
  }
  if (osmRows.length > 0) {
    console.log(`  Sample OSM row:`, JSON.stringify(osmRows[0]));
  }

  let matched = 0;
  let closestOverallDist = Infinity;

  for (const osmRow of osmRows) {
    if (osmRow.phone && osmRow.phone.trim()) continue;

    const olat = parseFloat(osmRow.latitude);
    const olon = parseFloat(osmRow.longitude);
    if (isNaN(olat) || isNaN(olon)) continue;

    let bestDist = thresholdMeters;
    let bestPhone = "";

    for (const manualRow of manualRows) {
      if (!manualRow.phone || !manualRow.phone.trim()) continue;
      const mlat = parseFloat(manualRow.latitude);
      const mlon = parseFloat(manualRow.longitude);
      if (isNaN(mlat) || isNaN(mlon)) continue;

      const dist = haversineMeters(olat, olon, mlat, mlon);
      if (dist < closestOverallDist) closestOverallDist = dist;
      if (dist < bestDist) {
        bestDist = dist;
        bestPhone = manualRow.phone;
      }
    }

    if (bestPhone) {
      osmRow.phone = bestPhone;
      osmRow.phone_source = "matched_by_location";
      matched++;
    }
  }

  console.log(`  Closest match found across entire dataset: ${closestOverallDist.toFixed(0)}m`);

  const headers = Object.keys(osmRows[0] || {});
  if (!headers.includes("phone_source")) headers.push("phone_source");

  await Bun.write(outputFile, toCSV(osmRows, headers));
  console.log(`${outputFile}: ${osmRows.length} total, ${matched} phone numbers added via location match\n`);
}

async function main() {
  await mergeDataset(
    "delhi-police-stations-real.csv",
    "delhi-police-stations-with-numbers.csv",
    "delhi-police-final.csv"
  );
  await mergeDataset("delhi-hospitals-real.csv", "delhi-hospitals.csv", "delhi-hospitals-final.csv");
  await mergeDataset("delhi-fire-stations-real.csv", "delhi-fire-stations.csv", "delhi-fire-final.csv");
  console.log("\nDone. Check delhi-police-final.csv, delhi-hospitals-final.csv, delhi-fire-final.csv");
}

main().catch(console.error);
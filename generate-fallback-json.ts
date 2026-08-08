/**
 * Converts your final merged CSVs into a single JSON file, saved to the
 * public folder — loaded at RUNTIME via fetch(), not bundled into the code
 * at build time. This avoids the Turbopack panic we hit trying to bundle
 * ~1000 entries as one giant hardcoded array.
 *
 * Run with: bun run generate-fallback-json.ts
 * Produces: apps/web/public/delhi-safety-data.json
 */

type Row = Record<string, string>;

function parseCSV(text: string): Row[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Row = {};
    headers.forEach((h, i) => (row[h] = values[i] ?? ""));
    return row;
  });
}

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else current += char;
  }
  result.push(current);
  return result;
}

async function rowsToEntries(csvFile: string, type: string) {
  const text = await Bun.file(csvFile).text();
  const rows = parseCSV(text);
  const seen = new Set<string>();
  const entries: any[] = [];

  for (const row of rows) {
    const name = (row.name || "").trim();
    const lat = parseFloat(row.latitude);
    const lng = parseFloat(row.longitude);
    if (!name || name === "Unnamed" || isNaN(lat) || isNaN(lng)) continue;

    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const entry: any = { name, type, lat, lng };
    const phone = (row.phone || "").trim();
    const address = (row.address || "").trim();
    if (phone) entry.phone = phone;
    if (address) entry.address = address;
    entries.push(entry);
  }
  return entries;
}

async function main() {
  const police = await rowsToEntries("delhi-police-final.csv", "police");
  const hospital = await rowsToEntries("delhi-hospitals-final.csv", "hospital");
  const fire = await rowsToEntries("delhi-fire-final.csv", "fire");

  console.log(`Police: ${police.length}, Hospitals: ${hospital.length}, Fire: ${fire.length}`);

  const data = { police, hospital, fire };
  await Bun.write("apps/web/public/delhi-safety-data.json", JSON.stringify(data));

  console.log("\nSaved apps/web/public/delhi-safety-data.json");
  console.log("\nThis file is NOT imported into code — it's fetched at runtime.");
  console.log("See the accompanying integration note for the small emergency.ts change.");
}

main().catch(console.error);
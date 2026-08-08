/**
 * Converts delhi-police-final.csv, delhi-hospitals-final.csv, and
 * delhi-fire-final.csv directly into a ready-to-import TypeScript file
 * with the full StaticService arrays — no manual copy-pasting needed.
 *
 * Run with: bun run generate-fallback-data.ts
 * Produces: apps/web/src/lib/delhi-fallback-data.ts
 *
 * Then in emergency.ts, just import and spread these into your existing
 * arrays — see the two-line integration note printed at the end.
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

function esc(s: string): string {
  return (s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function generateArray(csvFile: string, type: string, varName: string): Promise<string> {
  const text = await Bun.file(csvFile).text();
  const rows = parseCSV(text);
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const row of rows) {
    const name = (row.name || "").trim();
    const lat = parseFloat(row.latitude);
    const lng = parseFloat(row.longitude);
    if (!name || name === "Unnamed" || isNaN(lat) || isNaN(lng)) continue;

    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const phone = (row.phone || "").trim();
    const address = (row.address || "").trim();
    const phonePart = phone ? `, phone: "${esc(phone)}"` : "";
    const addrPart = address ? `, address: "${esc(address)}"` : "";

    lines.push(`  { name: "${esc(name)}", type: "${type}", lat: ${lat}, lng: ${lng}${phonePart}${addrPart} },`);
  }

  console.log(`${varName}: ${lines.length} entries`);
  return `export const ${varName} = [\n${lines.join("\n")}\n];\n`;
}

async function main() {
  const police = await generateArray("delhi-police-final.csv", "police", "ALL_DELHI_POLICE");
  const hospitals = await generateArray("delhi-hospitals-final.csv", "hospital", "ALL_DELHI_HOSPITALS");
  const fire = await generateArray("delhi-fire-final.csv", "fire", "ALL_DELHI_FIRE");

  const output = `// AUTO-GENERATED from delhi-*-final.csv — full real Delhi safety data.\n// Do not hand-edit; re-run generate-fallback-data.ts to regenerate.\n\n${police}\n${hospitals}\n${fire}`;

  await Bun.write("apps/web/src/lib/delhi-fallback-data.ts", output);

  console.log("\nSaved apps/web/src/lib/delhi-fallback-data.ts");
  console.log("\nNow add these two lines to the top of emergency.ts:");
  console.log('  import { ALL_DELHI_POLICE, ALL_DELHI_HOSPITALS, ALL_DELHI_FIRE } from "./delhi-fallback-data";');
  console.log("\nThen inside the fallbacksFor() function's consider() calls, change:");
  console.log('  consider("police", DELHI_POLICE);       -->  consider("police", ALL_DELHI_POLICE as any);');
  console.log('  consider("hospital", FALLBACK_HOSPITAL); -->  consider("hospital", ALL_DELHI_HOSPITALS as any);');
  console.log('  consider("fire", FALLBACK_FIRE);         -->  consider("fire", ALL_DELHI_FIRE as any);');
}

main().catch(console.error);
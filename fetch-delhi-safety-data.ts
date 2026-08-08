/**
 * Fetches REAL police stations and hospitals in Delhi from OpenStreetMap's
 * Overpass API — completely free, no API key, no signup, no billing ever
 * required (unlike Google Places, which needs a billing-enabled account
 * even for its free tier).
 *
 * Run this once with: bun run fetch-delhi-safety-data.ts
 * It writes two CSV files: delhi-police-stations-real.csv and
 * delhi-hospitals-real.csv, with whatever real data OSM has — including
 * phone numbers WHERE contributors have added them (OSM is crowdsourced,
 * so phone number coverage varies — some entries will have it, some won't;
 * this is honest, not a bug).
 */

// Overpass has multiple public mirror servers — the main one (overpass-api.de)
// is often overloaded and returns 504 timeouts. Trying mirrors in order
// makes this reliable instead of failing on the first busy server.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

const DELHI_BBOX = "28.40,76.85,28.90,77.35";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOSMData(amenityType: "police" | "hospital" | "fire_station") {
  const query = `
    [out:json][timeout:90];
    (
      node["amenity"="${amenityType}"](${DELHI_BBOX});
      way["amenity"="${amenityType}"](${DELHI_BBOX});
    );
    out center tags;
  `;

  let lastError: Error | null = null;

  for (const mirror of OVERPASS_MIRRORS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`  Trying ${mirror} (attempt ${attempt})...`);
        const res = await fetch(mirror, {
          method: "POST",
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "SafeHer-Hackathon-Project/1.0 (educational use)",
          },
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log(`  Success via ${mirror}`);
        return data.elements;
      } catch (err: any) {
        lastError = err;
        console.log(`  Failed: ${err.message}. Retrying...`);
        await sleep(3000);
      }
    }
  }

  throw new Error(`All Overpass mirrors failed. Last error: ${lastError?.message}`);
}

function toCSVRow(fields: (string | number)[]): string {
  return fields
    .map((f) => {
      const s = String(f ?? "");
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

async function main() {
  console.log("Fetching real Delhi police stations from OpenStreetMap...");
  const policeElements = await fetchOSMData("police");
  console.log(`Found ${policeElements.length} police stations`);

  const policeRows = ["name,latitude,longitude,phone,address,operator"];
  for (const el of policeElements) {
    const tags = el.tags || {};
    const lat = el.lat ?? el.center?.lat ?? "";
    const lon = el.lon ?? el.center?.lon ?? "";
    const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"]]
      .filter(Boolean)
      .join(" ");
    policeRows.push(
      toCSVRow([
        tags.name || "Unnamed",
        lat,
        lon,
        tags.phone || tags["contact:phone"] || "",
        address,
        tags.operator || "",
      ])
    );
  }
  await Bun.write("delhi-police-stations-real.csv", policeRows.join("\n"));
  console.log("Saved delhi-police-stations-real.csv");

  console.log("\nFetching real Delhi hospitals from OpenStreetMap...");
  const hospitalElements = await fetchOSMData("hospital");
  console.log(`Found ${hospitalElements.length} hospitals`);

  const hospitalRows = ["name,latitude,longitude,phone,address,emergency"];
  for (const el of hospitalElements) {
    const tags = el.tags || {};
    const lat = el.lat ?? el.center?.lat ?? "";
    const lon = el.lon ?? el.center?.lon ?? "";
    const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"]]
      .filter(Boolean)
      .join(" ");
    hospitalRows.push(
      toCSVRow([
        tags.name || "Unnamed",
        lat,
        lon,
        tags.phone || tags["contact:phone"] || "",
        address,
        tags.emergency || "",
      ])
    );
  }
  await Bun.write("delhi-hospitals-real.csv", hospitalRows.join("\n"));
  console.log("Saved delhi-hospitals-real.csv");

  const policeWithPhone = policeElements.filter((e: any) => e.tags?.phone || e.tags?.["contact:phone"]).length;
  const hospitalsWithPhone = hospitalElements.filter((e: any) => e.tags?.phone || e.tags?.["contact:phone"]).length;

  console.log("\nFetching real Delhi fire stations from OpenStreetMap...");
  const fireElements = await fetchOSMData("fire_station");
  console.log(`Found ${fireElements.length} fire stations`);

  const fireRows = ["name,latitude,longitude,phone,address"];
  for (const el of fireElements) {
    const tags = el.tags || {};
    const lat = el.lat ?? el.center?.lat ?? "";
    const lon = el.lon ?? el.center?.lon ?? "";
    const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"]]
      .filter(Boolean)
      .join(" ");
    fireRows.push(
      toCSVRow([tags.name || "Unnamed", lat, lon, tags.phone || tags["contact:phone"] || "", address])
    );
  }
  await Bun.write("delhi-fire-stations-real.csv", fireRows.join("\n"));
  console.log("Saved delhi-fire-stations-real.csv");
  const fireWithPhone = fireElements.filter((e: any) => e.tags?.phone || e.tags?.["contact:phone"]).length;

  console.log(`\nPhone number coverage (OSM is crowdsourced, so this varies):`);
  console.log(`Police: ${policeWithPhone}/${policeElements.length} have a phone number`);
  console.log(`Hospitals: ${hospitalsWithPhone}/${hospitalElements.length} have a phone number`);
  console.log(`Fire: ${fireWithPhone}/${fireElements.length} have a phone number`);
}

main().catch(console.error);
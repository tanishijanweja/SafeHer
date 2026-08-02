/**
 * News-based incident fetcher.
 *
 * DEFAULT MODE (USE_AI_EXTRACTION = false): keyword-matches article text
 * against real known Delhi locations. No API calls, no quota, works
 * instantly, every time. Less smart than AI extraction, but reliable.
 *
 * AI MODE (USE_AI_EXTRACTION = true): uses Gemini for smarter extraction.
 * Gemini's free tier has a hard cap of 20 requests/DAY — once that's spent,
 * it stays broken until the daily reset, regardless of code changes. Flip
 * this on for one real run before your demo, when the quota is fresh, then
 * flip back to false so testing doesn't burn through it again.
 */

import { DELHI_POLICE_STATIONS } from "./delhi-police-stations";

const USE_AI_EXTRACTION = false;

export type NewsIncident = {
  title: string;
  description: string;
  category: "harassment" | "stalking" | "unsafe_transport" | "poor_lighting" | "other";
  severity: number;
  latitude: number;
  longitude: number;
  date: string;
  source: string;
  matchedLocation: string;
};

type RssItem = { title: string; description: string; link: string; pubDate: string };
type Extraction = { location: string; category: NewsIncident["category"]; severity: number; isRelevant: boolean };

const NEWS_SOURCES = [
  { name: "Google News (Delhi safety)", url: `https://news.google.com/rss/search?q=${encodeURIComponent("Delhi women safety harassment")}&hl=en-IN&gl=IN&ceid=IN:en` },
  { name: "Google News (Delhi FIR)", url: `https://news.google.com/rss/search?q=${encodeURIComponent("Delhi molestation FIR")}&hl=en-IN&gl=IN&ceid=IN:en` },
  { name: "Times of India — Delhi", url: "https://timesofindia.indiatimes.com/rssfeeds/-2128838597.cms" },
  { name: "Hindustan Times — India", url: "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml" },
];

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemBlocks = xml.split("<item>").slice(1);
  for (const block of itemBlocks) {
    items.push({
      title: (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, ""),
      description: (block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, ""),
      link: block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "",
      pubDate: block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "",
    });
  }
  return items;
}

function extractWithKeywordMatch(articleText: string, knownLocations: string[]): Extraction {
  const lower = articleText.toLowerCase();
  const isRelevant = /harass|molest|assault|stalk|rape|kidnap|unsafe|attack/.test(lower);
  if (!isRelevant) return { location: "NONE", category: "other", severity: 1, isRelevant: false };

  const match = knownLocations.find((loc) => loc.length > 4 && lower.includes(loc.toLowerCase()));
  let category: NewsIncident["category"] = "other";
  if (lower.includes("stalk")) category = "stalking";
  else if (lower.includes("cab") || lower.includes("bus") || lower.includes("auto")) category = "unsafe_transport";
  else if (lower.includes("harass") || lower.includes("molest") || lower.includes("assault")) category = "harassment";

  return { location: match ?? "NONE", category, severity: 3, isRelevant: true };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractWithGemini(articleText: string, knownLocations: string[]): Promise<Extraction | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Extract structured safety-incident data from this news snippet for a Delhi women's safety map.

Article: "${articleText}"

Known locations (pick one exactly, or "NONE"): ${knownLocations.slice(0, 50).join(", ")}

Respond ONLY with JSON:
{"isRelevant": boolean, "location": string, "category": "harassment"|"stalking"|"unsafe_transport"|"poor_lighting"|"other", "severity": number}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
    );
    const data = await res.json();
    if (!res.ok) {
      console.error("Gemini API error:", JSON.stringify(data));
      return null;
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) return null;
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (err) {
    console.error("Gemini extraction failed:", err);
    return null;
  }
}

function findCoordinates(locationName: string): { latitude: number; longitude: number } | null {
  const lower = locationName.toLowerCase();
  const exact = DELHI_POLICE_STATIONS.find((s) => s.name.toLowerCase() === lower || s.district.toLowerCase() === lower);
  if (exact) return { latitude: exact.latitude, longitude: exact.longitude };
  const partial = DELHI_POLICE_STATIONS.find((s) => lower.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(lower));
  return partial ? { latitude: partial.latitude, longitude: partial.longitude } : null;
}

export async function fetchNewsIncidents(maxArticles = USE_AI_EXTRACTION ? 5 : 20): Promise<NewsIncident[]> {
  // Include both real station names AND real district names as match
  // candidates — district names ("Dwarka", "Rohini", "Shahdara") are more
  // likely to actually appear in article text than exact station names, so
  // this genuinely broadens what counts as a match without changing any
  // matching logic itself.
  const stationNames = DELHI_POLICE_STATIONS.map((s) => s.name);
  const districtNames = [...new Set(DELHI_POLICE_STATIONS.map((s) => s.district))];
  const knownLocationNames = [...stationNames, ...districtNames];
  const results: NewsIncident[] = [];
  let processed = 0;

  for (const source of NEWS_SOURCES) {
    if (processed >= maxArticles) break;
    try {
      const res = await fetch(source.url);
      const xml = await res.text();
      const items = parseRssItems(xml).slice(0, 8);

      for (const item of items) {
        if (processed >= maxArticles) break;

        if (USE_AI_EXTRACTION && processed > 0) await sleep(13000);
        processed++;

        const combinedText = `${item.title}. ${item.description}`;
        const extraction = USE_AI_EXTRACTION
          ? await extractWithGemini(combinedText, knownLocationNames)
          : extractWithKeywordMatch(combinedText, knownLocationNames);

        if (!extraction || !extraction.isRelevant || extraction.location === "NONE") continue;

        const coords = findCoordinates(extraction.location);
        if (!coords) continue;

        results.push({
          title: item.title.replace(/\s*-\s*[^-]+$/, ""),
          description: item.description.slice(0, 300),
          category: extraction.category,
          severity: extraction.severity,
          latitude: coords.latitude,
          longitude: coords.longitude,
          date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          source: item.link,
          matchedLocation: extraction.location,
        });
      }
    } catch (err) {
      console.error(`Failed to fetch/process news from "${source.name}":`, err);
    }
  }

  const seen = new Set<string>();
  return results.filter((r) => (seen.has(r.source) ? false : (seen.add(r.source), true)));
}
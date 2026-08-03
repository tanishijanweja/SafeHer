import { DELHI_LOCATIONS } from "./delhi-locations";

export const DELHI_BBOX = { minLat: 28.4, maxLat: 28.9, minLng: 76.9, maxLng: 77.35 };

/** Known GDELT admin-level Delhi centroids — never use these for neighborhood heatmaps */
const DELHI_CITY_CENTROIDS: Array<{ lat: number; lng: number }> = [
  { lat: 28.6667, lng: 77.2167 },
  { lat: 28.7041, lng: 77.1025 },
  { lat: 28.6139, lng: 77.209 },
  { lat: 28.61, lng: 77.23 },
  { lat: 28.6, lng: 77.2 },
  { lat: 28.65, lng: 77.22 },
  { lat: 28.6333, lng: 77.2167 },
  { lat: 28.62, lng: 77.21 },
  { lat: 28.64, lng: 77.22 },
];

const CITY_LEVEL_NAMES = new Set([
  "delhi",
  "new delhi",
  "newdelhi",
  "nct",
  "nct of delhi",
  "national capital territory",
  "national capital territory of delhi",
  "india",
  "bharat",
  "delhi ncr",
  "ncr",
  "delhi india",
]);

/** Exact GDELT theme tokens (matched after splitting V2Themes on `;` / `,`) */
export const CRIME_THEME_ALLOWLIST = new Set([
  "SEXUAL_VIOLENCE",
  "SEXUAL_ASSAULT",
  "SEXUAL_ABUSE",
  "SEXUAL_HARASSMENT",
  "DOMESTIC_VIOLENCE",
  "KILL",
  "WOUND",
  "KIDNAP",
  "HOSTAGE",
  "TERROR",
  "ASSASSINATION",
  "HUMAN_TRAFFICKING",
  "CRISISLEX_C07_SAFETY",
  "CRISISLEX_T03_RESCUE",
  "CRISISLEX_C04_CRIME",
  "SOC_GENERALCRIME",
  "ARMEDCONFLICT",
  "PROTEST",
  "TAX_FNCACT_VICTIM",
  "TAX_FNCACT_POLICE",
  "TAX_FNCACT_ARREST",
  "TAX_FNCACT_SUSPECT",
  "ARREST",
  "TRIAL",
  "CRIME_ILLEGAL_DRUGS",
]);

const TITLE_BLOCKLIST =
  /\b(breastfeeding|world breastfeeding|mango exports?|art exhibitions?|employment schemes?|cabinet reshuffl\w*|parliament sessions?|minister inaugurates|launches? scheme|budget speech|election rall(y|ies)|opinion:|editorial:|awareness (week|month|day|campaign)|international women'?s day|gender equality workshop|skill development|exports? (hit|rise|surge|grow)|import dut(y|ies)|cricket|football match|\bipl\b|bollywood|box office|weather forecast|stock market|sensex|nifty|gdp growth|tourism promotion|yoga day|swachh bharat|felicitat\w*|inaugurat(e|ion|ed|es)|foundation stone|mou signed|bilateral talks?|press conference on scheme|women ministers?|pm (modi )?addresses|prime minister (says|addresses|launches)|recipe|horoscope|fashion week)\b/i;

/** Broader crime/public-safety keywords (title or URL slug) */
const CRIME_TITLE_KEYWORDS =
  /\b(rape|raped|raping|gang[\s-]?rape|molest|molestation|harass|harassment|eve[\s-]?teas|sexual|stalk|stalking|murder|murdered|killed|killing|homicide|dowry|acid|kidnap|kidnapped|abduct|abduction|traffick|assault|assaulted|robbery|snatch|snatching|theft|stolen|shoot|shot|shooter|stab|stabbed|att?a?ck|attacked|attacker|domestic|honou?r[\s-]?kill|lynch|lynched|pocso|groped|groping|fir\b|arrested|accused|slain|slay|crime|criminal|police|encounter|gunpoint|looted|loot|extort|blackmail|violence|violent|bleed|bleeding|body found|dead body|suspicious death|missing (girl|woman|child)|gang|thug|goon|beaten|thrash|hacked|chopped|set ablaze|burnt alive|suicide|self immolat)\b/i;

export type RejectReason =
  | "rejected_blocklist"
  | "rejected_no_crime_keyword"
  | "rejected_not_delhi"
  | "rejected_no_location"
  | "rejected_centroid"
  | "rejected_duplicate"
  | "pass";

export interface FilterDecision {
  reason: RejectReason;
  locality: ResolvedLocality | null;
  detail?: string;
}

export function inDelhiBbox(lat: number, lng: number): boolean {
  return (
    lat >= DELHI_BBOX.minLat &&
    lat <= DELHI_BBOX.maxLat &&
    lng >= DELHI_BBOX.minLng &&
    lng <= DELHI_BBOX.maxLng
  );
}

export function parseThemeTokens(v2Themes: string): string[] {
  if (!v2Themes) return [];
  const tokens: string[] = [];
  for (const part of v2Themes.split(";")) {
    const code = part.split(",")[0]?.trim().toUpperCase();
    if (code) tokens.push(code);
  }
  return tokens;
}

export function isBlockedTitle(title: string): boolean {
  if (!title || title.trim().length < 6) return true;
  if (/^gdelt article from\b/i.test(title)) return true;
  // Bare article IDs / UUIDs are not headlines
  if (/^(\d{6,}|article[\s_-]?\w{6,}|articles?)$/i.test(title.trim())) return true;
  // Never treat a raw URL as the title for blocklist — caller should pass a slug
  const text = title.startsWith("http") ? title.replace(/^https?:\/\/[^/]+/, "") : title;
  return TITLE_BLOCKLIST.test(text);
}

export function hasCrimeKeyword(text: string): boolean {
  return CRIME_TITLE_KEYWORDS.test(text);
}

const CRIME_KEYWORD_WEIGHTS: Record<string, number> = {
  rape: 15,
  raping: 15,
  "gang-rape": 18,
  "gang rape": 18,
  sexual: 12,
  molest: 12,
  molestion: 12,
  groping: 12,
  groped: 12,
  pocso: 15,
  murder: 14,
  murdered: 14,
  killed: 13,
  killing: 13,
  homicide: 14,
  slain: 13,
  slay: 13,
  kidnap: 14,
  kidnapped: 14,
  abduct: 14,
  abduction: 14,
  traffick: 14,
  dowry: 12,
  acid: 14,
  "honour kill": 14,
  "honor kill": 14,
  lynching: 13,
  lynched: 13,
  lynch: 13,
  "eve tease": 10,
  "eve teasing": 10,
  assault: 10,
  assaulted: 10,
  attacked: 9,
  attacker: 9,
  attack: 9,
  shoot: 12,
  shot: 12,
  shooter: 12,
  stab: 11,
  stabbed: 11,
  harassment: 10,
  harass: 10,
  stalking: 10,
  stalk: 10,
  domestic: 10,
  violence: 8,
  violent: 8,
  robbery: 8,
  snatching: 7,
  snatch: 7,
  theft: 6,
  stolen: 6,
  loot: 6,
  looted: 6,
  extortion: 7,
  extort: 7,
  blackmail: 7,
  "body found": 8,
  "dead body": 8,
  "suspicious death": 8,
  "missing girl": 10,
  "missing woman": 10,
  "missing child": 10,
  suicide: 6,
  "self immolation": 8,
  "self immolate": 8,
  fir: 3,
  arrested: 4,
  accused: 4,
  crime: 4,
  criminal: 4,
  police: 3,
  encounter: 3,
  gunpoint: 4,
  beaten: 5,
  thrash: 5,
  hacked: 5,
  chopped: 5,
  "set ablaze": 8,
  "burnt alive": 8,
  gang: 4,
  thug: 4,
  goon: 4,
  bleeding: 5,
  bleed: 5,
};

const WOMEN_SAFETY_KEYWORDS =
  /\b(wom[ae]n|girl|female|lad(y|ies)|housewife|daughter|sister|mother|aunt|teenage girl|minor girl)\b/i;

const SEVERITY_BOOST =
  /\b(rape|sexual|molest|gang[\s-]?rape|pocso|murder|killed|homicide|kidnap|acid|dowry|lynch|honou?r[\s-]?kill|body found|dead body|traffick)\b/i;

const CRIME_THEME_WEIGHTS: Record<string, number> = {
  SEXUAL_VIOLENCE: 15,
  SEXUAL_ASSAULT: 15,
  SEXUAL_ABUSE: 14,
  SEXUAL_HARASSMENT: 12,
  DOMESTIC_VIOLENCE: 12,
  KILL: 14,
  WOUND: 8,
  KIDNAP: 14,
  HOSTAGE: 12,
  TERROR: 10,
  ASSASSINATION: 12,
  HUMAN_TRAFFICKING: 14,
  CRISISLEX_C07_SAFETY: 5,
  CRISISLEX_T03_RESCUE: 4,
  CRISISLEX_C04_CRIME: 5,
  SOC_GENERALCRIME: 5,
  ARMEDCONFLICT: 8,
  PROTEST: 3,
  TAX_FNCACT_VICTIM: 4,
  TAX_FNCACT_POLICE: 3,
  TAX_FNCACT_ARREST: 4,
  TAX_FNCACT_SUSPECT: 3,
  ARREST: 4,
  TRIAL: 3,
  CRIME_ILLEGAL_DRUGS: 5,
};

export function scoreArticle(
  title: string,
  url: string,
  v2Themes: string,
  affectsHeatmap: boolean,
): number {
  let score = 0;
  const text = `${title} ${url}`.toLowerCase();

  let keywordHits = 0;
  for (const [keyword, weight] of Object.entries(CRIME_KEYWORD_WEIGHTS)) {
    if (text.includes(keyword.toLowerCase())) {
      score += weight;
      keywordHits++;
    }
  }

  // Diminishing returns for many keyword hits
  if (keywordHits > 5) {
    const excess = keywordHits - 5;
    score -= Math.round(excess * 3);
  }

  const themeTokens = parseThemeTokens(v2Themes);
  let themeScore = 0;
  for (const token of themeTokens) {
    themeScore += CRIME_THEME_WEIGHTS[token] ?? 0;
  }
  score += themeScore;

  if (WOMEN_SAFETY_KEYWORDS.test(text)) {
    score += 10;
  }

  if (SEVERITY_BOOST.test(text)) {
    score += 8;
  }

  if (affectsHeatmap) {
    score += 10;
  }

  return Math.max(0, Math.round(score));
}

export function hasCrimeTheme(v2Themes: string): boolean {
  const tokens = parseThemeTokens(v2Themes);
  return tokens.some((t) => CRIME_THEME_ALLOWLIST.has(t));
}

/** Crime signal = keyword in title/url OR any crime-related GKG theme */
export function hasCrimeSignal(title: string, url: string, v2Themes: string): boolean {
  const text = `${title} ${url}`;
  if (hasCrimeKeyword(text)) return true;
  if (hasCrimeTheme(v2Themes)) return true;
  return false;
}

export function isCityLevelName(name: string): boolean {
  const n = name.toLowerCase().trim();
  if (CITY_LEVEL_NAMES.has(n)) return true;
  if (/^(new\s+)?delhi(\s*,?\s*india)?$/.test(n)) return true;
  return false;
}

export function isNearCityCentroid(lat: number, lng: number, maxKm = 3.0): boolean {
  for (const c of DELHI_CITY_CENTROIDS) {
    const dlat = (lat - c.lat) * 111;
    const dlng = (lng - c.lng) * 111 * Math.cos((lat * Math.PI) / 180);
    const km = Math.sqrt(dlat * dlat + dlng * dlng);
    if (km <= maxKm) return true;
  }
  return false;
}

export interface ParsedLocation {
  name: string;
  lat: number;
  lng: number;
  featureType?: string;
}

/**
 * GDELT V2Locations: type#name#countrycode#adm1#lat#lng#featureid
 */
export function parseLocations(v2Locations: string): ParsedLocation[] {
  if (!v2Locations) return [];

  const results: ParsedLocation[] = [];
  for (const part of v2Locations.split(";")) {
    const fields = part.split("#");
    if (fields.length < 6) continue;

    const lat = Number(fields[4]);
    const lng = Number(fields[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;

    results.push({
      name: fields[1] ?? "unknown",
      lat,
      lng,
      featureType: fields[0],
    });
  }
  return results;
}

export function matchGazetteer(text: string): { name: string; lat: number; lng: number } | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  const entries = Object.entries(DELHI_LOCATIONS).sort((a, b) => b[0].length - a[0].length);

  for (const [name, coords] of entries) {
    const n = name.toLowerCase();
    // Skip very short tokens (≤3 chars) unless exact token — prevents "ITO" in "monitoring"
    if (n.length <= 3) {
      const re = new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
      if (re.test(lower)) return { name, ...coords };
      continue;
    }
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    if (re.test(lower)) {
      return { name, ...coords };
    }
  }
  return null;
}

export interface ResolvedLocality {
  name: string;
  lat: number;
  lng: number;
  /** false = city-level only; must not paint neighborhood heatmap */
  affectsHeatmap: boolean;
}

export function hasDelhiTextSignal(title: string, url = ""): boolean {
  const t = `${title} ${url}`.toLowerCase();
  if (/\b(delhi|new[\s-]?delhi|\bncr\b|dwarka|rohini|saket|okhla|mehrauli|narela|najafgarh|karol[\s-]?bagh|lajpat|hauz[\s-]?khas|vasant|pitampura|shahdara|mayur[\s-]?vihar|janakpuri|chandni[\s-]?chowk|connaught)\b/i.test(t)) {
    return true;
  }
  if (matchGazetteer(title) || matchGazetteer(url)) return true;
  return false;
}

export function hasDelhiGeo(v2Locations: string): boolean {
  return parseLocations(v2Locations).some((l) => inDelhiBbox(l.lat, l.lng));
}

/**
 * Resolve locality without requiring text signal (geo-only path allowed).
 */
export function resolveDelhiLocality(
  title: string,
  v2Locations: string,
  url = "",
): ResolvedLocality | null {
  const fromTitle = matchGazetteer(title) ?? matchGazetteer(url);
  if (fromTitle) {
    return { ...fromTitle, affectsHeatmap: true };
  }

  const locs = parseLocations(v2Locations).filter((l) => inDelhiBbox(l.lat, l.lng));
  if (locs.length === 0) return null;

  const specific: ParsedLocation[] = [];
  const cityOnly: ParsedLocation[] = [];

  for (const loc of locs) {
    const cityName = isCityLevelName(loc.name);
    const nearCentroid = isNearCityCentroid(loc.lat, loc.lng);
    const gaz = matchGazetteer(loc.name);

    if (gaz) {
      specific.push({ name: gaz.name, lat: gaz.lat, lng: gaz.lng });
      continue;
    }

    if (cityName || nearCentroid) {
      cityOnly.push(loc);
    } else {
      specific.push(loc);
    }
  }

  if (specific.length > 0) {
    specific.sort((a, b) => b.name.length - a.name.length);
    const best = specific[0]!;
    return {
      name: best.name,
      lat: best.lat,
      lng: best.lng,
      affectsHeatmap: !isNearCityCentroid(best.lat, best.lng),
    };
  }

  const city = cityOnly[0];
  if (city) {
    return {
      name: city.name || "Delhi",
      lat: city.lat,
      lng: city.lng,
      affectsHeatmap: false,
    };
  }

  return null;
}

/**
 * Single-entry filter with explicit rejection reason.
 *
 * Pass if:
 *  - not blocklisted
 *  - has crime keyword OR crime theme
 *  - has Delhi text signal OR Delhi GKG geo
 *  - can resolve a locality (city-level OK with affectsHeatmap=false)
 */
export function evaluateArticle(
  title: string,
  url: string,
  v2Themes: string,
  v2Locations: string,
): FilterDecision {
  const display = title || url;

  if (isBlockedTitle(display)) {
    return { reason: "rejected_blocklist", locality: null };
  }

  if (!hasCrimeSignal(title, url, v2Themes)) {
    return { reason: "rejected_no_crime_keyword", locality: null };
  }

  const delhiText = hasDelhiTextSignal(title, url);
  const delhiGeo = hasDelhiGeo(v2Locations);

  if (!delhiText && !delhiGeo) {
    return { reason: "rejected_not_delhi", locality: null };
  }

  let locality = resolveDelhiLocality(title, v2Locations, url);

  // Delhi mentioned in text/URL but GKG has no usable coords → keep as city-level
  // (does not paint neighborhood heatmap; still a valid candidate for Gemini)
  if (!locality && delhiText) {
    locality = {
      name: "Delhi",
      lat: 28.6139,
      lng: 77.209,
      affectsHeatmap: false,
    };
  }

  if (!locality) {
    return { reason: "rejected_no_location", locality: null };
  }

  return {
    reason: "pass",
    locality,
    detail: locality.affectsHeatmap ? "neighborhood" : "city_level",
  };
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(the|a|an|in|at|of|and|or|to|for|on|by|with|from|after|over|as|is|are|was|were|has|have|had|delhi|new)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function makeDedupeKey(title: string, publishedAt: Date): string {
  const day = publishedAt.toISOString().slice(0, 10);
  const norm = normalizeTitle(title).slice(0, 120);
  return `${day}|${norm}`;
}

export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeTitle(a).split(" ").filter((t) => t.length > 2));
  const tb = new Set(normalizeTitle(b).split(" ").filter((t) => t.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

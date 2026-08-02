import type { ReportCategory } from "./types";

export interface AnalysisResult {
  severity: number;
  is_spam: boolean;
  status: "unverified" | "community-corroborated";
  category: ReportCategory;
  keywords: string[];
  used: "gemini" | "heuristic";
}

const SEVERITY_BASE: Record<ReportCategory, number> = {
  assault: 4,
  harassment: 3,
  stalking: 4,
  "dark-alley": 3,
  "poor-lighting": 2,
  theft: 3,
  "unsafe-transit": 3,
  "unsafe-area": 3,
  other: 2,
};

const CATEGORY_HINTS: { category: ReportCategory; words: string[] }[] = [
  {
    category: "assault",
    words: [
      "assault",
      "attack",
      "beaten",
      "beating",
      "hit",
      "pushed",
      "shoved",
      "molest",
      "molested",
      "groped",
      "groping",
      "drag",
      "dragged",
      "gang",
      "rape",
      "raped",
      "stabbed",
      "knife",
      "weapon",
    ],
  },
  {
    category: "theft",
    words: [
      "theft",
      "thief",
      "thieves",
      "stolen",
      "snatch",
      "snatched",
      "snatching",
      "pickpocket",
      "chain snatching",
      "purse",
      "wallet",
      "mobile",
      "phone taken",
      "robbery",
      "rob",
    ],
  },
  {
    category: "harassment",
    words: [
      "harassed",
      "harassment",
      "eve",
      "catcall",
      "catcalling",
      "whistle",
      "whistled",
      "leer",
      "leering",
      "comments",
      "touched",
      "touching",
      "inappropriately",
    ],
  },
  {
    category: "stalking",
    words: [
      "stalking",
      "stalk",
      "stalked",
      "followed",
      "following",
      "follows",
      "hiding",
      "waiting for me",
      "shadowing",
    ],
  },
  {
    category: "unsafe-transit",
    words: [
      "metro",
      "bus",
      "auto",
      "rickshaw",
      "cab",
      "taxi",
      "station",
      "platform",
      "terminal",
      "transit",
      "commute",
      "last train",
      "bus stop",
    ],
  },
  {
    category: "dark-alley",
    words: [
      "dark",
      "alley",
      "isolated",
      "deserted",
      "abandoned",
      "secluded",
      "lonely street",
      "unlit road",
    ],
  },
  {
    category: "poor-lighting",
    words: [
      "lighting",
      "streetlight",
      "street light",
      "street lamp",
      "no light",
      "dim",
      "dark street",
      "lamp",
    ],
  },
  {
    category: "unsafe-area",
    words: [
      "unsafe",
      "dangerous",
      "stranger",
      "strangers",
      "loitering",
      "drunk",
      "drunks",
      "fight",
      "drugs",
      "drug addicts",
      "crime",
      "criminals",
    ],
  },
];

/**
 * Picks the best-matching category from the report text. Specific and severe
 * categories are matched first so e.g. an assault wins over generic
 * harassment. Falls back to "other".
 */
export function detectCategory(text: string): ReportCategory {
  const lower = text.toLowerCase();
  for (const { category, words } of CATEGORY_HINTS) {
    if (words.some((w) => lower.includes(w))) return category;
  }
  return "other";
}

const SEVERE_WORDS: { word: string; bump: number }[] = [
  { word: "attack", bump: 1 },
  { word: "assault", bump: 1 },
  { word: "molest", bump: 1 },
  { word: "groped", bump: 1 },
  { word: "knife", bump: 1 },
  { word: "gang", bump: 1 },
  { word: "raped", bump: 1 },
  { word: "drag", bump: 1 },
  { word: "hit", bump: 1 },
  { word: "beaten", bump: 1 },
  { word: "threat", bump: 0 },
  { word: "followed", bump: 0 },
  { word: "stalking", bump: 0 },
  { word: "harassed", bump: 0 },
  { word: "eve", bump: 0 },
  { word: "snatch", bump: 0 },
  { word: "dark", bump: 0 },
  { word: "isolated", bump: 0 },
  { word: "deserted", bump: 0 },
  { word: "cable", bump: 0 },
];

const SPAM_WORDS = [
  "click here",
  "buy now",
  "win a",
  "lottery",
  "free gift",
  "www.",
  "http",
  "100%",
  "call now",
  "loan offer",
  "earn money",
  "whatsapp group",
  "subscribe",
];

/**
 * Local heuristic classifier. Always returns a valid result and never throws,
 * so saving a report can never be blocked by an AI failure.
 */
export function analyzeHeuristic(text: string): AnalysisResult {
  const lower = text.toLowerCase();
  const category = detectCategory(text);
  const keywords: string[] = [];

  let severity = SEVERITY_BASE[category];

  for (const { word, bump } of SEVERE_WORDS) {
    if (lower.includes(word)) {
      keywords.push(word);
      severity += bump;
    }
  }

  const is_spam = SPAM_WORDS.some((w) => lower.includes(w));

  // Reports that multiple users have not yet backed up stay unverified.
  // Risk is bumped slightly for severe content so the heatmap reacts instantly.
  const status = "unverified" as const;

  return {
    severity: Math.max(1, Math.min(5, Math.round(severity))),
    is_spam,
    status,
    category,
    keywords: [...new Set(keywords)],
    used: "heuristic",
  };
}

/**
 * Analyzes a report. Tries the real Gemini path via the local API route when a
 * GEMINI_API_KEY is configured; otherwise (or on any failure/timeout) it falls
 * back to the local heuristic so the app never freezes.
 */
export async function analyzeReport(text: string): Promise<AnalysisResult> {
  const fallback = analyzeHeuristic(text);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as Partial<AnalysisResult>;
      if (
        typeof data.severity === "number" &&
        data.severity >= 1 &&
        data.severity <= 5
      ) {
        return {
          severity: Math.round(data.severity),
          is_spam: Boolean(data.is_spam),
          status: data.status ?? "unverified",
          category: data.category ?? fallback.category,
          keywords: Array.isArray(data.keywords) ? data.keywords : fallback.keywords,
          used: "gemini",
        };
      }
    }
  } catch {
    // Gemini unreachable/timeout — fall through to the local heuristic.
  }

  return fallback;
}

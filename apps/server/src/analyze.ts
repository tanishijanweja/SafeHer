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
      "assault", "attack", "beaten", "beating", "hit", "pushed", "shoved",
      "molest", "molested", "groped", "groping", "drag", "dragged", "gang",
      "rape", "raped", "stabbed", "knife", "weapon",
    ],
  },
  {
    category: "theft",
    words: [
      "theft", "thief", "thieves", "stolen", "snatch", "snatched", "snatching",
      "pickpocket", "chain snatching", "purse", "wallet", "mobile", "phone taken",
      "robbery", "rob",
    ],
  },
  {
    category: "harassment",
    words: [
      "harassed", "harassment", "eve", "catcall", "catcalling", "whistle",
      "whistled", "leer", "leering", "comments", "touched", "touching",
      "inappropriately",
    ],
  },
  {
    category: "stalking",
    words: [
      "stalking", "stalk", "stalked", "followed", "following", "follows",
      "hiding", "waiting for me", "shadowing",
    ],
  },
  {
    category: "unsafe-transit",
    words: [
      "metro", "bus", "auto", "rickshaw", "cab", "taxi", "station", "platform",
      "terminal", "transit", "commute", "last train", "bus stop",
    ],
  },
  {
    category: "dark-alley",
    words: [
      "dark", "alley", "isolated", "deserted", "abandoned", "secluded",
      "lonely street", "unlit road",
    ],
  },
  {
    category: "poor-lighting",
    words: [
      "lighting", "streetlight", "street light", "street lamp", "no light",
      "dim", "dark street", "lamp",
    ],
  },
  {
    category: "unsafe-area",
    words: [
      "unsafe", "dangerous", "stranger", "strangers", "loitering", "drunk",
      "drunks", "fight", "drugs", "drug addicts", "crime", "criminals",
    ],
  },
];

/** Picks the best-matching category from the report text, else "other". */
export function detectCategory(text: string): ReportCategory {
  const lower = text.toLowerCase();
  for (const { category, words } of CATEGORY_HINTS) {
    if (words.some((w) => lower.includes(w))) return category;
  }
  return "other";
}

const SEVERE_WORDS: [string, number][] = [
  ["attack", 1], ["assault", 1], ["molest", 1], ["groped", 1], ["knife", 1],
  ["gang", 1], ["raped", 1], ["drag", 1], ["hit", 1], ["beaten", 1],
  ["threat", 0], ["followed", 0], ["stalking", 0], ["harassed", 0], ["eve", 0],
  ["snatch", 0], ["dark", 0], ["isolated", 0], ["deserted", 0], ["cable", 0],
];

const SPAM_WORDS = [
  "click here", "buy now", "win a", "lottery", "free gift", "www.",
  "http", "100%", "call now", "loan offer", "earn money", "whatsapp group", "subscribe",
];

/** Local heuristic classifier — always returns a valid result, never throws. */
export function analyzeHeuristic(text: string): AnalysisResult {
  const lower = text.toLowerCase();
  const category = detectCategory(text);
  const keywords: string[] = [];
  let severity = SEVERITY_BASE[category];
  for (const [word, bump] of SEVERE_WORDS) {
    if (lower.includes(word)) {
      keywords.push(word);
      severity += bump;
    }
  }
  const is_spam = SPAM_WORDS.some((w) => lower.includes(w));
  return {
    severity: Math.max(1, Math.min(5, Math.round(severity))),
    is_spam,
    status: "unverified",
    category,
    keywords: [...new Set(keywords)],
    used: "heuristic",
  };
}

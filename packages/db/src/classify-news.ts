export type NewsCategory =
  | "sexual_violence"
  | "harassment"
  | "domestic_violence"
  | "kidnapping"
  | "homicide_assault"
  | "robbery_theft"
  | "other_crime"
  | "not_incident";

export interface NewsClassification {
  isIncident: boolean;
  category: NewsCategory;
  severity: number;
  confidence: number;
  isWomenSafety: boolean;
  locality: string | null;
  reason: string;
}

/** Discriminated result so callers can separate API failure from "not an incident" */
export type ClassifyOutcome =
  | { status: "classified"; classification: NewsClassification }
  | { status: "api_failed"; error: string };

const GEMINI_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-2.0-flash",
];

function buildPrompt(title: string, domain: string): string {
  return `You classify news headlines for SafeHer, a women's public-safety app focused on Delhi, India.

Decide if the headline reports a SPECIFIC criminal or public-safety INCIDENT (something that happened or is alleged to have happened to real people in a place).

REJECT (isIncident=false) if the article is about:
- government schemes, policies, laws, budgets, parliament, ministers' speeches
- awareness campaigns, international days, workshops, statistics releases without a new local incident
- sports, entertainment, lifestyle, exports/trade, weather, markets
- national rollups with no local Delhi incident
- editorials/opinion without a concrete new incident
- historical anniversaries ("X years since...")

ACCEPT concrete incidents: rape, assault, harassment, stalking, murder, kidnapping, robbery, snatching, trafficking, shootings, police encounters with criminals, etc.

Headline: ${JSON.stringify(title)}
Source domain: ${JSON.stringify(domain)}

Respond with ONLY valid JSON:
{
  "isIncident": boolean,
  "category": "sexual_violence"|"harassment"|"domestic_violence"|"kidnapping"|"homicide_assault"|"robbery_theft"|"other_crime"|"not_incident",
  "severity": 1-5 integer,
  "confidence": 0.0-1.0,
  "isWomenSafety": boolean,
  "locality": string or null (Delhi neighborhood/area if mentioned, else null),
  "reason": "short reason"
}`;
}

export function fallbackFromTitle(title: string): NewsClassification {
  const women =
    /\b(rape|sexual|molest|harass|eve[\s-]?teas|dowry|acid|stalk|women|girl|pocso)\b/i.test(
      title,
    );
  const crime =
    /\b(rape|murder|kill|assault|kidnap|robbery|snatch|harass|molest|attack|shoot|shot|stab|theft|crime|police|encounter|arrested|accused)\b/i.test(
      title,
    );

  if (!crime) {
    return {
      isIncident: false,
      category: "not_incident",
      severity: 1,
      confidence: 0.3,
      isWomenSafety: false,
      locality: null,
      reason: "fallback: no crime keyword",
    };
  }

  let category: NewsCategory = "other_crime";
  if (/\b(rape|sexual|molest|pocso)\b/i.test(title)) category = "sexual_violence";
  else if (/\b(harass|eve[\s-]?teas|stalk)\b/i.test(title)) category = "harassment";
  else if (/\b(dowry|domestic)\b/i.test(title)) category = "domestic_violence";
  else if (/\b(kidnap|abduct|traffick)\b/i.test(title)) category = "kidnapping";
  else if (/\b(murder|kill|assault|stab|shoot|shot)\b/i.test(title)) category = "homicide_assault";
  else if (/\b(robbery|snatch|theft)\b/i.test(title)) category = "robbery_theft";

  return {
    isIncident: true,
    category,
    severity: category === "sexual_violence" || category === "homicide_assault" ? 4 : 3,
    confidence: 0.55,
    isWomenSafety: women,
    locality: null,
    reason: "fallback: keyword heuristic",
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parseClassification(raw: unknown): NewsClassification | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const isIncident = Boolean(o.isIncident);
  const category = String(o.category ?? "not_incident") as NewsCategory;
  const severity = clamp(Math.round(Number(o.severity) || 3), 1, 5);
  const confidence = clamp(Number(o.confidence) || 0.5, 0, 1);
  const isWomenSafety = Boolean(o.isWomenSafety);
  const locality =
    typeof o.locality === "string" && o.locality.trim() ? o.locality.trim() : null;
  const reason = typeof o.reason === "string" ? o.reason : "";

  return { isIncident, category, severity, confidence, isWomenSafety, locality, reason };
}

async function callGemini(model: string, prompt: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Gemini ${model} HTTP ${res.status}: ${body.slice(0, 200)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error(`Gemini ${model} empty response`);
  return text;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Classify headline via Gemini.
 * Returns status=api_failed on quota/network errors (caller should queue, not count as reject).
 * Does NOT silently fall back — caller decides.
 */
export async function classifyNewsHeadline(
  title: string,
  domain: string,
): Promise<ClassifyOutcome> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // No key: use keyword fallback as a real classification
    return { status: "classified", classification: fallbackFromTitle(title) };
  }

  const prompt = buildPrompt(title, domain);
  let lastError = "unknown";

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await callGemini(model, prompt, apiKey);
        const parsed = parseClassification(JSON.parse(text));
        if (!parsed) throw new Error("invalid JSON shape");

        if (!parsed.isIncident || parsed.category === "not_incident") {
          return {
            status: "classified",
            classification: {
              ...parsed,
              isIncident: false,
              category: "not_incident",
            },
          };
        }

        return { status: "classified", classification: parsed };
      } catch (error) {
        lastError = String(error).slice(0, 200);
        const status = (error as { status?: number }).status;
        console.warn(
          `  Gemini model ${model} failed (attempt ${attempt + 1}):`,
          lastError.slice(0, 120),
        );
        if (status === 429 || status === 503) {
          await sleep(3000 * (attempt + 1));
          continue;
        }
        break;
      }
    }
  }

  return { status: "api_failed", error: lastError };
}

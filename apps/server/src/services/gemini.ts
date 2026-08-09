import { GoogleGenAI } from "@google/genai";

import { ReportCategory } from "@safe-her/db";

import { REPORT_ANALYSIS_PROMPT } from "../prompts";

const GEMINI_MODELS = [
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-flash-lite-latest",
];
const EMBEDDING_MODEL = "gemini-embedding-001";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

type ReportAnalysis = {
  summary: string;
  category: ReportCategory;
  severity: 1 | 2 | 3 | 4 | 5;
};

/** Clamp model severity to the 1..5 integer range (injection can return junk). */
function clampSeverity(value: unknown): ReportAnalysis["severity"] {
  const n = Number(value);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n))) as ReportAnalysis["severity"];
}

const VALID_CATEGORIES = Object.values(ReportCategory);

/** Only real report categories may be stored; anything else becomes OTHER. */
function safeCategory(value: unknown): ReportCategory {
  return VALID_CATEGORIES.includes(value as ReportCategory)
    ? (value as ReportCategory)
    : ReportCategory.OTHER;
}

/** Bound what reaches the model: an over-long report would just burn tokens. */
const MAX_REPORT_CHARS = 4000;

function clampDescription(raw: string): string {
  return (raw ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_REPORT_CHARS);
}

/**
 * Sanitize AI-generated summary text before it's stored and shown publicly.
 * Strips URLs, tags and markup so a poisoned model output can't smuggle links
 * or HTML into the community feed (React also escapes, but never trust the AI).
 */
function sanitizeSummary(raw: string): string {
  return (raw ?? "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[<>{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
  });
  return result.embeddings?.[0]?.values ?? [];
}

export async function analyzeReport(
  description: string,
  incidentDate?: Date,
): Promise<ReportAnalysis> {
  const config = {
    responseMimeType: "application/json",
    responseSchema: {
      type: "OBJECT",
      properties: {
        summary: { type: "STRING" },
        category: { type: "STRING" },
        severity: { type: "INTEGER" },
      },
      required: ["summary", "category", "severity"],
    },
  };

  let lastError: unknown;
  for (const model of GEMINI_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: REPORT_ANALYSIS_PROMPT(clampDescription(description), incidentDate),
        config,
      });
      const text = response.text ?? "";
      const parsed = JSON.parse(text) as ReportAnalysis;
      return {
        summary: sanitizeSummary(parsed.summary ?? ""),
        category: safeCategory(parsed.category),
        severity: clampSeverity(parsed.severity),
      };
    } catch (error) {
      lastError = error;
      console.warn(`Gemini model "${model}" failed, trying next:`, error);
    }
  }

  throw lastError;
}

import { GoogleGenAI } from "@google/genai";

import type { ReportCategory } from "@safe-her/db";

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

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
  });
  return result.embeddings?.[0]?.values ?? [];
}

export async function analyzeReport(description: string): Promise<ReportAnalysis> {
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
        contents: REPORT_ANALYSIS_PROMPT(description),
        config,
      });
      const text = response.text ?? "";
      return JSON.parse(text) as ReportAnalysis;
    } catch (error) {
      lastError = error;
      console.warn(`Gemini model "${model}" failed, trying next:`, error);
    }
  }

  throw lastError;
}

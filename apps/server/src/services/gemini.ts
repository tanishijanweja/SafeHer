import { GoogleGenAI } from "@google/genai";

import type { ReportCategory } from "@safe-her/db";

import { REPORT_ANALYSIS_PROMPT } from "../prompts";

const GEMINI_MODEL = "gemini-flash-latest";
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
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: REPORT_ANALYSIS_PROMPT(description),
    config: {
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
    },
  });

  const text = response.text ?? "";
  return JSON.parse(text) as ReportAnalysis;
}

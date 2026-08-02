import { NextResponse } from "next/server";

import { analyzeHeuristic } from "@/lib/ai";
import { REPORT_CATEGORIES } from "@/lib/types";

/**
 * Server-side AI analysis for reports.
 * Uses Gemini 2.5 Flash when GEMINI_API_KEY is configured; otherwise (or on any
 * failure/timeout) it returns the local heuristic result so saving is never
 * blocked and the app never freezes — the rule the whole team follows.
 */
export async function POST(req: Request) {
  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const text = (body.text ?? "").slice(0, 2000);

  const fallback = analyzeHeuristic(text);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !text) {
    return NextResponse.json(fallback);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    "You classify safety reports for SafeHer, a community safety app in India.\n" +
                    "Analyze the report and return ONLY valid JSON with these exact keys: " +
                    '{ "category": string, "severity": number 1-5 (5=most severe), "is_spam": boolean, "status": "unverified"|"community-corroborated", "keywords": string[] }.\n' +
                    "Choose category from exactly one of: " +
                    REPORT_CATEGORIES.map((c) => c.value).join(", ") +
                    ".\n" +
                    "Severity reflects physical danger and urgency. Mark obvious ad/spam/irrelevant content as is_spam=true.\n" +
                    `Report text: "${text}"`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
        signal: controller.signal,
      },
    );
    clearTimeout(timer);

    if (!res.ok) return NextResponse.json(fallback);

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return NextResponse.json(fallback);

    const parsed = JSON.parse(raw) as {
      category?: string;
      severity?: number;
      is_spam?: boolean;
      status?: "unverified" | "community-corroborated";
      keywords?: string[];
    };
    if (typeof parsed.severity !== "number" || parsed.severity < 1 || parsed.severity > 5) {
      return NextResponse.json(fallback);
    }
    const category = REPORT_CATEGORIES.some((c) => c.value === parsed.category)
      ? (parsed.category as (typeof REPORT_CATEGORIES)[number]["value"])
      : fallback.category;
    return NextResponse.json({
      category,
      severity: Math.round(parsed.severity),
      is_spam: Boolean(parsed.is_spam),
      status: parsed.status === "community-corroborated" ? "community-corroborated" : "unverified",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8) : [],
      used: "gemini",
    });
  } catch {
    return NextResponse.json(fallback);
  }
}

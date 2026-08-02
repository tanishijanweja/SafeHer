import { NextResponse } from "next/server";
import { fetchNewsIncidents } from "@/lib/news-incident-fetcher";

export async function GET() {
  try {
    const incidents = await fetchNewsIncidents(10);
    return NextResponse.json({ incidents, count: incidents.length });
  } catch (err) {
    console.error("News incident fetch failed:", err);
    return NextResponse.json({ incidents: [], count: 0, error: String(err) }, { status: 500 });
  }
}
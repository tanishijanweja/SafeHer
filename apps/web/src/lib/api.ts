import { env } from "@safe-her/env/web";

import type { HeatmapArea } from "@/lib/heatmap-areas";

export const API_URL = env.NEXT_PUBLIC_SERVER_URL;

export type ReportConfidence = "UNVERIFIED" | "COMMUNITY_CORROBORATED";

export type Report = {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  severity: number;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  aiSummary: string | null;
  isSpam: boolean;
  confidenceLevel: ReportConfidence;
  createdAt: string;
  updatedAt: string;
  geohash: string;
};

export async function fetchReports(): Promise<Report[]> {
  const res = await fetch(`${API_URL}/reports`);
  if (!res.ok) throw new Error(`Reports HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchHeatmap(): Promise<HeatmapArea[]> {
  const res = await fetch(`${API_URL}/heatmap`);
  if (!res.ok) throw new Error(`Heatmap HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}

export function formatCategory(raw: string): string {
  const labels: Record<string, string> = {
    HARASSMENT: "Harassment",
    THEFT: "Theft",
    ASSAULT: "Assault",
    SUSPICIOUS_ACTIVITY: "Suspicious Activity",
    UNSAFE_AREA: "Unsafe Area",
    OTHER: "Other",
    poor_lighting: "Poor Lighting",
    dark_alley: "Dark Alley / Isolated Spot",
  };
  if (labels[raw]) return labels[raw];
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function severityLabel(severity: number): "Mild" | "Moderate" | "Severe" {
  if (severity <= 2) return "Mild";
  if (severity <= 3) return "Moderate";
  return "Severe";
}

export function relativeTimeShort(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

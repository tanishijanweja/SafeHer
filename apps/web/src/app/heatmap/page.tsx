"use client";

import { useEffect, useState } from "react";

import dynamic from "next/dynamic";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@safe-her/ui/components/card";

const SafetyMap = dynamic(() => import("@/components/safety-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center border border-input text-xs text-muted-foreground">
      Loading map...
    </div>
  ),
});

type HeatmapCell = {
  id: string;
  latitude: number;
  longitude: number;
  areaName: string;
  riskLevel: "Low" | "Medium" | "High";
  newsIncidentCount: number;
  communityReportCount: number;
  recentCategories: string[];
  reasons: string[];
  lastUpdated: string;
};

const MAP_CENTER = { lat: 28.61, lng: 77.2 };

function riskColor(level: HeatmapCell["riskLevel"]) {
  if (level === "High") return "#ef4444";
  if (level === "Medium") return "#eab308";
  return "#22c55e";
}

function riskEmoji(level: HeatmapCell["riskLevel"]) {
  if (level === "High") return "🔴";
  if (level === "Medium") return "🟡";
  return "🟢";
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "unknown";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? "1 minute ago" : `${min} minutes ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? "1 hour ago" : `${hr} hours ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/** Compact hover chip */
function HeatmapHover({ cell }: { cell: HeatmapCell }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span>📍 {cell.areaName}</span>
      <span>
        {riskEmoji(cell.riskLevel)} {cell.riskLevel} Risk
      </span>
    </div>
  );
}

/** Full details on click */
function HeatmapPopup({ cell }: { cell: HeatmapCell }) {
  return (
    <div
      style={{
        minWidth: 200,
        maxWidth: 250,
        fontSize: 12.5,
        lineHeight: 1.4,
        color: "#111827",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4, paddingRight: 16 }}>
        📍 {cell.areaName}
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        {riskEmoji(cell.riskLevel)} {cell.riskLevel} Risk
      </div>

      {cell.reasons.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, color: "#374151", marginBottom: 2 }}>Why?</div>
          <ul style={{ margin: 0, paddingLeft: 16, color: "#1f2937" }}>
            {cell.reasons.map((r) => (
              <li key={r} style={{ marginBottom: 2 }}>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cell.recentCategories.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, color: "#374151", marginBottom: 2 }}>
            Recent incidents
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, color: "#1f2937" }}>
            {cell.recentCategories.map((cat) => (
              <li key={cat}>{cat}</li>
            ))}
          </ul>
        </div>
      )}

      {cell.communityReportCount > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, color: "#374151", marginBottom: 2 }}>
            Community Reports
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, color: "#1f2937" }}>
            <li>
              {cell.communityReportCount} SafeHer report
              {cell.communityReportCount === 1 ? "" : "s"}
            </li>
          </ul>
        </div>
      )}

      <div
        style={{
          borderTop: "1px solid #e5e7eb",
          paddingTop: 6,
          color: "#6b7280",
          fontSize: 11.5,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 1 }}>Last updated</div>
        <div>• {relativeTime(cell.lastUpdated)}</div>
      </div>
    </div>
  );
}

export default function HeatmapPage() {
  const [scores, setScores] = useState<HeatmapCell[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("http://localhost:3000/heatmap")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setScores(data);
        else setError("Unexpected response");
      })
      .catch((e) => setError(String(e)));
  }, []);

  const points = scores.map((cell) => ({
    id: cell.id,
    lat: cell.latitude,
    lng: cell.longitude,
    color: riskColor(cell.riskLevel),
    hover: <HeatmapHover cell={cell} />,
    popup: <HeatmapPopup cell={cell} />,
  }));

  return (
    <main className="flex flex-col items-center gap-6 p-6">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Safety Heatmap</CardTitle>
          <CardDescription>
            Hover for a quick peek · Click for full details
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error ? (
            <div className="text-xs text-red-600">Failed to load heatmap: {error}</div>
          ) : (
            <SafetyMap center={MAP_CENTER} height={440} points={points} />
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>🟢 Low risk</span>
            <span>🟡 Medium risk</span>
            <span>🔴 High risk</span>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Areas</CardTitle>
          <CardDescription>Summary of risk zones on the map.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Area</th>
                <th className="py-2 pr-4 font-medium">Risk</th>
                <th className="py-2 pr-4 font-medium">Recent incidents</th>
                <th className="py-2 font-medium">Community reports</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((score) => (
                <tr key={score.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{score.areaName}</td>
                  <td className="py-2 pr-4">
                    {riskEmoji(score.riskLevel)} {score.riskLevel}
                  </td>
                  <td className="py-2 pr-4">
                    {score.recentCategories.length > 0
                      ? score.recentCategories.join(", ")
                      : "—"}
                  </td>
                  <td className="py-2">{score.communityReportCount}</td>
                </tr>
              ))}
              {scores.length === 0 && !error && (
                <tr>
                  <td colSpan={4} className="py-4 text-muted-foreground">
                    No risk zones loaded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </main>
  );
}

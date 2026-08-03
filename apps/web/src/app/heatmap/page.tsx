"use client";

import { useEffect, useMemo, useState } from "react";

import dynamic from "next/dynamic";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@safe-her/ui/components/card";

import {
  type AreaRegion,
  type HeatmapCell,
  groupCellsIntoAreas,
  relativeTime,
  riskColor,
  riskEmoji,
} from "@/lib/heatmap-areas";

const SafetyMap = dynamic(() => import("@/components/safety-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center border border-input text-xs text-muted-foreground">
      Loading map...
    </div>
  ),
});

const MAP_CENTER = { lat: 28.61, lng: 77.2 };

/** Compact hover tooltip — plain language only */
function AreaHoverTooltip({ area }: { area: AreaRegion }) {
  return (
    <div
      style={{
        minWidth: 180,
        maxWidth: 230,
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{area.areaName}</div>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
        {riskEmoji(area.riskLevel)} {area.riskLevel} Risk
      </div>

      {area.reasons.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: "#374151", marginBottom: 2 }}>
            Reason:
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#1f2937" }}>
            {area.reasons.map((r) => (
              <li key={r} style={{ marginBottom: 1 }}>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {area.recentCategories.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: "#374151", marginBottom: 2 }}>
            Recent incidents:
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#1f2937" }}>
            {area.recentCategories.map((cat) => (
              <li key={cat}>{cat}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: "#6b7280", borderTop: "1px solid #e5e7eb", paddingTop: 6 }}>
        Last updated: {relativeTime(area.lastUpdated)}
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

  const areas = useMemo(() => groupCellsIntoAreas(scores), [scores]);

  const polygons = useMemo(
    () =>
      areas.map((area) => ({
        id: area.id,
        positions: area.polygon,
        color: riskColor(area.riskLevel),
        hover: <AreaHoverTooltip area={area} />,
      })),
    [areas],
  );

  return (
    <main className="flex flex-col items-center gap-6 p-6">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Safety Heatmap</CardTitle>
          <CardDescription>Hover an area for details · 3 risk levels only</CardDescription>
        </CardHeader>

        <CardContent>
          {error ? (
            <div className="text-xs text-red-600">Failed to load heatmap: {error}</div>
          ) : (
            <SafetyMap center={MAP_CENTER} height={480} polygons={polygons} />
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#22c55e]" /> Low risk
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#eab308]" /> Medium risk
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#ef4444]" /> High risk
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Areas</CardTitle>
          <CardDescription>Localities on the map, grouped by name.</CardDescription>
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
              {areas.map((area) => (
                <tr key={area.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{area.areaName}</td>
                  <td className="py-2 pr-4">
                    {riskEmoji(area.riskLevel)} {area.riskLevel}
                  </td>
                  <td className="py-2 pr-4">
                    {area.recentCategories.length > 0
                      ? area.recentCategories.join(", ")
                      : "—"}
                  </td>
                  <td className="py-2">{area.communityReportCount}</td>
                </tr>
              ))}
              {areas.length === 0 && !error && (
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

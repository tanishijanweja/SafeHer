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

type RiskScore = {
  geohash: string;
  combinedScore: number;
};

const MAP_CENTER = { lat: 28.61, lng: 77.2 };

const MARKER_POSITIONS = [
  { lat: 28.61, lng: 77.2 },
  { lat: 28.63, lng: 77.22 },
  { lat: 28.59, lng: 77.18 },
  { lat: 28.62, lng: 77.24 },
  { lat: 28.6, lng: 77.16 },
];

function scoreColor(score: number) {
  if (score >= 0.7) return "#ef4444";
  if (score >= 0.4) return "#eab308";
  return "#22c55e";
}

export default function HeatmapPage() {
  const [scores, setScores] = useState<RiskScore[]>([]);

  useEffect(() => {
    fetch("http://localhost:3000/heatmap")
      .then((res) => res.json())
      .then(setScores);
  }, []);

  const markers = MARKER_POSITIONS.map((pos, i) => ({
    ...pos,
    combinedScore: scores[i % scores.length]?.combinedScore ?? 0.5,
  }));

  return (
    <main className="flex flex-col items-center gap-6 p-6">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Heatmap</CardTitle>
          <CardDescription>
            Risk zones colored by combined score (green &lt; yellow &lt; red).
          </CardDescription>
        </CardHeader>

        <CardContent>
          <SafetyMap
            center={MAP_CENTER}
            height={400}
            points={markers.map((marker) => ({
              lat: marker.lat,
              lng: marker.lng,
              color: scoreColor(marker.combinedScore),
            }))}
          />
        </CardContent>
      </Card>

      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Risk Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Geohash</th>
                <th className="py-2 font-medium">Combined Score</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((score) => (
                <tr key={score.geohash} className="border-b last:border-0">
                  <td className="py-2 pr-4">{score.geohash}</td>
                  <td className="py-2">{score.combinedScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </main>
  );
}

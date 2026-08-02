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
  latitude: number;
  longitude: number;
  combinedScore: number;
  incidentCount: number;
};

const MAP_CENTER = { lat: 28.61, lng: 77.2 };

function scoreColor(score: number) {
  if (score < 2) return "#22c55e";
  if (score < 4) return "#eab308";
  return "#ef4444";
}

export default function HeatmapPage() {
  const [scores, setScores] = useState<RiskScore[]>([]);

  useEffect(() => {
    fetch("http://localhost:3000/heatmap")
      .then((res) => res.json())
      .then(setScores);
  }, []);

  const points = scores.map((score) => ({
    lat: score.latitude,
    lng: score.longitude,
    color: scoreColor(score.combinedScore),
    popup: (
      <>
        <div>Combined Score: {score.combinedScore}</div>
        <div>Incidents: {score.incidentCount}</div>
      </>
    ),
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
            points={points}
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
                <th className="py-2 pr-4 font-medium">Combined Score</th>
                <th className="py-2 font-medium">Incidents</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((score) => (
                <tr key={score.geohash} className="border-b last:border-0">
                  <td className="py-2 pr-4">{score.geohash}</td>
                  <td className="py-2 pr-4">{score.combinedScore}</td>
                  <td className="py-2">{score.incidentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </main>
  );
}

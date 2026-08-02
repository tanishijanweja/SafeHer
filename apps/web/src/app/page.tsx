"use client";

import CrimeContextPanel from "@/components/crime-context-panel";
import RiskHeatmap from "@/components/risk-heatmap";

export default function Home() {
  return (
    <main style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ marginBottom: "1.5rem" }}>SafeHer Risk Heatmap</h1>
      <RiskHeatmap />
      <CrimeContextPanel />
    </main>
  );
}
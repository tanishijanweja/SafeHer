"use client";

// Real, cited Delhi Police / NCRB citywide crime trend data (2023-2025).
// This is CITYWIDE only (no district breakdown exists for these categories
// in a format we could process), shown as context alongside the district
// map — not colored on it, so we're not implying false district precision.
const CRIME_TRENDS = [
  { label: "Snatching", y2023: 1812, y2025: 1199, unit: "cases" },
  { label: "Robbery", y2023: 375, y2025: 315, unit: "cases" },
  { label: "Molestation", y2023: 2345, y2025: 2037, unit: "cases" },
  { label: "Rape cases", y2023: 2141, y2025: 2076, unit: "cases" },
  { label: "Murder", y2023: 506, y2025: 504, unit: "cases" },
  { label: "Burglary", y2023: 28600, y2025: 29000, unit: "cases" },
];

function pctChange(from: number, to: number): number {
  return Math.round(((to - from) / from) * 100);
}

export default function CrimeContextPanel() {
  return (
    <div style={{ maxWidth: 760, margin: "16px auto 0", border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
      <h3 style={{ fontSize: 14, margin: "0 0 4px", fontWeight: 600 }}>Delhi crime trends, citywide (2023 → 2025)</h3>
      <p style={{ fontSize: 11, color: "#999", margin: "0 0 12px" }}>
        Source: Delhi Police / NCRB annual data, reported via Deccan Herald. Citywide totals — no district-level
        breakdown exists for these categories, shown here as context alongside the district map above, not
        blended into its scoring.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {CRIME_TRENDS.map((t) => {
          const change = pctChange(t.y2023, t.y2025);
          const improved = change < 0;
          return (
            <div key={t.label} style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 12, color: "#666" }}>{t.label}</div>
              <div style={{ fontSize: 18, fontWeight: 600, margin: "2px 0" }}>{t.y2025.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: improved ? "#3B6D11" : "#791F1F" }}>
                {improved ? "↓" : "↑"} {Math.abs(change)}% since 2023
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
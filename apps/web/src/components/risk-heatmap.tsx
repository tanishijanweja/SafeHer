"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import { SEED_INCIDENTS } from "@/lib/seed-incidents";
import { FAKE_DEMO_REPORTS } from "@/lib/fake-demo-reports";
import { calculateLiveComponent } from "@/lib/risk-formula";

// Leaflet's default .leaflet-tooltip CSS forces white-space: nowrap, which
// silently overrides any wrapping styles set on content INSIDE the tooltip
// (our maxWidth/wordBreak settings don't apply because this rule sits above
// them in the DOM, at the Leaflet-controlled wrapper level). This global
// override is the correct, documented fix — targeting our custom class.
const TOOLTIP_STYLE_OVERRIDE = `
  .risk-tooltip { white-space: normal !important; width: 220px !important; max-width: 220px !important; }
`;

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import("react-leaflet").then((m) => m.GeoJSON), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => m.CircleMarker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });
const Tooltip = dynamic(() => import("react-leaflet").then((m) => m.Tooltip), { ssr: false });

// Live layer still needs a score->color mapping since incidents aren't
// pre-baked into a static file — this part is fine as a function, the bug
// was specifically in the GeoJSON district layer.
// 5-tier scale instead of 3 — gives real navigation-relevant distinction
// instead of lumping half the city into one "moderate" bucket.
function scoreToColor5(score: number): string {
  if (score <= 20) return "#4A9B3D"; // very safe
  if (score <= 40) return "#97C459"; // safe
  if (score <= 60) return "#EF9F27"; // caution
  if (score <= 80) return "#D95B2B"; // risky
  return "#791F1F"; // avoid
}
function scoreToLabel5(score: number): string {
  if (score <= 20) return "Very Safe";
  if (score <= 40) return "Safe";
  if (score <= 60) return "Caution";
  if (score <= 80) return "Risky";
  return "Avoid";
}
const liveScoreToColor = scoreToColor5;

function buildLivePoints() {
  return SEED_INCIDENTS.map((incident) => {
    const severityScore = (incident.severity / 5) * 100;
    return { ...incident, score: Math.round(severityScore), isSynthetic: false };
  });
}

// Shared formatters — used everywhere text is generated, so there's exactly
// one place that fixes "underscore/abbreviation" issues, not several.
function formatCategory(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const LOCATION_ABBREVIATIONS: Record<string, string> = {
  "Indl. Area": "Industrial Area",
  "Indl.Area": "Industrial Area",
  "Indl Area": "Industrial Area",
  "Rly.": "Railway ",
  "Stn.": "Station",
};

function formatLocationName(raw: string): string {
  let result = raw;
  for (const [abbr, full] of Object.entries(LOCATION_ABBREVIATIONS)) {
    result = result.replace(abbr, full);
  }
  return result;
}

// Fake demo reports use REAL recency decay via calculateLiveComponent, since
// their daysAgo field was designed to exercise that exact formula path —
// unlike seed incidents (which are genuine historical backfill), these are
// meant to simulate genuine live reports, so the true recency-weighted
// scoring is the honest choice here.
function buildFakeDemoPoints() {
  return FAKE_DEMO_REPORTS.map((r) => {
    const createdAt = new Date(Date.now() - r.daysAgo * 24 * 60 * 60 * 1000);
    const score = calculateLiveComponent([{ severity: r.severity, createdAt, status: r.status }]);
    return {
      title: `${formatCategory(r.category)} near ${formatLocationName(r.near)}`,
      description: r.description,
      time: r.time,
      category: r.category,
      severity: r.severity,
      latitude: r.latitude,
      longitude: r.longitude,
      date: createdAt.toISOString(),
      source: "Synthetic demo data — not real",
      score,
      isSynthetic: true,
    };
  });
}

export default function RiskHeatmap() {
  const [mounted, setMounted] = useState(false);
  const [layer, setLayer] = useState<"historical" | "live">("historical");
  const [geoData, setGeoData] = useState<any>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newsIncidents, setNewsIncidents] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [hour, setHour] = useState(new Date().getHours());
  const [showSynthetic, setShowSynthetic] = useState(true);
  const [selectedLivePoint, setSelectedLivePoint] = useState<any>(null);
  const mapWrapperRef = useRef<HTMLDivElement | null>(null);

  // Close the selected pin's side panel when clicking anywhere outside the
  // map. This is a plain DOM listener on `document`, completely separate
  // from Leaflet's own click-event system — so it can't conflict with or
  // break marker clicks the way hooking into Leaflet's events did before.
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (mapWrapperRef.current && !mapWrapperRef.current.contains(e.target as Node)) {
        setSelectedLivePoint(null);
      }
    }
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);
  const geoJsonRef = useRef<any>(null);

  // Time-of-day risk adjustment: night hours (10pm-5am) get a real boost,
  // dusk/dawn (7-8pm, 5-7am) get a smaller one — matches the spirit of the
  // formula's night multiplier, extended into a smooth gradient for a
  // genuinely useful, visually clear "how does risk change through the day" view.
  function timeAdjustedScore(baseScore: number, h: number): number {
    let boost = 0;
    if (h >= 22 || h < 5) boost = 20;
    else if (h >= 20 || h < 7) boost = 10;
    return Math.min(100, baseScore + boost);
  }

  function scoreToColor5(score: number): string {
    if (score <= 20) return "#4A9B3D";
    if (score <= 40) return "#97C459";
    if (score <= 60) return "#EF9F27";
    if (score <= 80) return "#D95B2B";
    return "#791F1F";
  }

  // Re-color every district live as the slider moves, without remounting
  // the whole map — this is the standard react-leaflet pattern for dynamic
  // GeoJSON styling (grab the layer group via ref, restyle each sub-layer).
  useEffect(() => {
    if (!geoJsonRef.current) return;
    geoJsonRef.current.eachLayer((l: any) => {
      const base = l.feature.properties.riskScore;
      const adjusted = timeAdjustedScore(base, hour);
      l.setStyle({ fillColor: scoreToColor5(adjusted) });
    });
  }, [hour, geoData]);

  async function fetchLatestNews() {
    setNewsLoading(true);
    try {
      const res = await fetch("/api/news-incidents");
      const data = await res.json();
      setNewsIncidents(
        (data.incidents || []).map((n: any) => ({
          ...n,
          score: Math.round((n.severity / 5) * 100),
        }))
      );
    } catch (err) {
      console.error("Failed to fetch live news incidents:", err);
    } finally {
      setNewsLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);
    fetch("/delhi-districts.geojson")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} — file not found at /delhi-districts.geojson`);
        return res.json();
      })
      .then((data) => {
        // Sanity check on load: confirm the data actually has baked colors,
        // so a bad file fails loudly instead of silently rendering wrong.
        const sample = data?.features?.[0]?.properties;
        if (!sample || !sample.fillColor) {
          throw new Error("Loaded file is missing expected fillColor property — wrong file or stale copy.");
        }
        setGeoData(data);
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  if (!mounted) {
    return <div style={{ height: 560, background: "#f5f5f5", borderRadius: 12 }} />;
  }

  if (loadError) {
    return (
      <div style={{ padding: 16, border: "1px solid #e5b3b3", borderRadius: 12, background: "#fdf2f2", color: "#a33", fontSize: 13 }}>
        Failed to load district map data: {loadError}
        <br />
        Check that <code>apps/web/public/delhi-districts.geojson</code> exists and is the latest version.
      </div>
    );
  }

  if (!geoData) {
    return <div style={{ height: 560, background: "#f5f5f5", borderRadius: 12 }} />;
  }

  const livePoints = [...buildLivePoints(), ...newsIncidents, ...(showSynthetic ? buildFakeDemoPoints() : [])];

  // Style reads the PRE-COMPUTED fillColor directly from each feature's
  // properties — no scoring, no thresholds, no function logic that could
  // silently fail. Just "use whatever color is already baked into this
  // specific feature's data."
  const districtStyle = (feature: any) => ({
    fillColor: feature.properties.fillColor,
    fillOpacity: 0.6,
    color: "#ffffff",
    weight: 1.5,
    opacity: 1,
  });

  const onEachDistrict = (feature: any, geoLayer: any) => {
    const baseStyle = districtStyle(feature);
    const props = feature.properties;
    geoLayer.bindTooltip(
      `<strong>${props.DISTRICT}</strong><br/>${props.riskLabel} · ${props.riskScore}`,
      { sticky: true, direction: "top", opacity: 0.95 }
    );
    geoLayer.on({
      mouseover: (e: any) => e.target.setStyle({ ...baseStyle, fillOpacity: 0.85, weight: 2.5 }),
      mouseout: (e: any) => e.target.setStyle(baseStyle),
      click: () => setSelectedDistrict(feature.properties),
    });
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <style>{TOOLTIP_STYLE_OVERRIDE}</style>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>
          {layer === "historical"
            ? `${geoData.features.length} real districts · real NCRB 2022 data`
            : `${SEED_INCIDENTS.length + newsIncidents.length} real cited incidents${showSynthetic ? ` + ${FAKE_DEMO_REPORTS.length} synthetic demo reports` : ""}`}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setLayer("historical")}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: layer === "historical" ? "#333" : "white",
              color: layer === "historical" ? "white" : "#333",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Historical (NCRB district data)
          </button>
          <button
            onClick={() => setLayer("live")}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: layer === "live" ? "#333" : "white",
              color: layer === "live" ? "white" : "#333",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Live (community reports)
          </button>
          {layer === "live" && (
            <button
              onClick={fetchLatestNews}
              disabled={newsLoading}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: "white",
                color: "#333",
                cursor: newsLoading ? "wait" : "pointer",
                fontSize: 13,
              }}
            >
              {newsLoading ? "Fetching real news..." : "+ Fetch latest real news"}
            </button>
          )}
        </div>
      </div>

      {layer === "live" && (
        <div style={{ marginBottom: 12, padding: "10px 14px", border: "1px solid #f0d9a0", borderRadius: 10, background: "#fffbf0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#8a6d1f" }}>
            ⚠ Includes synthetic demo data (marked clearly on each pin) — not real incidents, simulates what real community reports will look like.
          </span>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", whiteSpace: "nowrap", marginLeft: 12 }}>
            <input type="checkbox" checked={showSynthetic} onChange={(e) => setShowSynthetic(e.target.checked)} />
            Show synthetic data
          </label>
        </div>
      )}

      {layer === "historical" && (
        <div style={{ marginBottom: 12, padding: "12px 16px", border: "1px solid #eee", borderRadius: 10, background: "#fafafa" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", marginBottom: 6 }}>
            <span>Time of day</span>
            <strong>
              {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
              {(hour >= 22 || hour < 5) && <span style={{ color: "#791F1F" }}> · Night — elevated risk</span>}
            </strong>
          </div>
          <input type="range" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} style={{ width: "100%" }} />
          <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
            Drag to see how risk shifts through the day — night hours (10pm-5am) apply a real elevated-risk adjustment to every district.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div ref={mapWrapperRef} style={{ flex: 1, border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
          <MapContainer center={[28.62, 77.15]} zoom={10} style={{ height: 560, width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            {layer === "historical" ? (
              <GeoJSON key="delhi-districts" ref={geoJsonRef} data={geoData} style={districtStyle} onEachFeature={onEachDistrict} />
            ) : (
              <>
                {livePoints.map((p: any) => {
                  const cleanCategory = formatCategory(p.category);
                  return (
                    <CircleMarker
                      key={p.title + p.latitude}
                      center={[p.latitude, p.longitude]}
                      radius={p.isSynthetic ? 7 : 10}
                      pathOptions={{
                        fillColor: liveScoreToColor(p.score),
                        fillOpacity: p.isSynthetic ? 0.45 : 0.7,
                        color: liveScoreToColor(p.score),
                        weight: 2,
                        dashArray: p.isSynthetic ? "3 2" : undefined,
                      }}
                      eventHandlers={{ click: () => setSelectedLivePoint({ ...p, cleanCategory }) }}
                    >
                    {/* Hover: key facts only, per UX best practice (NN/g) — under ~150 chars, no links/actions */}
                    <Tooltip className="risk-tooltip" direction="auto" offset={[0, -8]} opacity={1} sticky>
                      <div style={{ maxWidth: 220, boxSizing: "border-box" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5, marginBottom: 2 }}>
                          <strong style={{ fontSize: 13, wordBreak: "break-word" }}>{p.title}</strong>
                          {p.isSynthetic && (
                            <span style={{ fontSize: 9, color: "#8a6d1f", background: "#fdf2d0", padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>
                              DEMO
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "#888" }}>
                          {cleanCategory} · Severity {p.severity}/5 · {new Date(p.date).toLocaleDateString()}
                        </div>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                );
                })}
              </>
            )}
          </MapContainer>
        </div>

        {/* Side panel for the live tab — same pattern as the historical
            district panel, so clicked details live in one consistent place
            instead of a floating box on the map. */}
        {layer === "live" && (
          <div style={{ width: 220, flexShrink: 0 }}>
            {selectedLivePoint ? (
              <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
                {selectedLivePoint.isSynthetic && (
                  <div style={{ fontSize: 10, color: "#8a6d1f", background: "#fdf2d0", display: "inline-block", padding: "2px 6px", borderRadius: 4, marginBottom: 8 }}>
                    DEMO
                  </div>
                )}
                <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>{selectedLivePoint.title}</h3>
                <div
                  style={{
                    display: "inline-block",
                    padding: "2px 10px",
                    borderRadius: 6,
                    background: liveScoreToColor(selectedLivePoint.score),
                    color: "#fff",
                    fontSize: 12,
                    marginBottom: 10,
                  }}
                >
                  {scoreToLabel5(selectedLivePoint.score)} · {selectedLivePoint.score}
                </div>
                <p style={{ fontSize: 12, color: "#555", lineHeight: 1.5, marginBottom: 8 }}>
                  {selectedLivePoint.cleanCategory} · Severity {selectedLivePoint.severity}/5
                  <br />
                  {new Date(selectedLivePoint.date).toLocaleDateString()}
                  {selectedLivePoint.time ? `, ${selectedLivePoint.time}` : ""}
                </p>
                <p style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>{selectedLivePoint.description}</p>
                {selectedLivePoint.source?.startsWith("http") && (
                  <a
                    href={selectedLivePoint.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11, color: "#2563eb" }}
                  >
                    Read source article →
                  </a>
                )}
              </div>
            ) : (
              <div style={{ border: "1px dashed #ddd", borderRadius: 12, padding: 16, color: "#999", fontSize: 12 }}>
                Click a pin to see its details.
              </div>
            )}
          </div>
        )}

        {layer === "historical" && (
          <div style={{ width: 200, flexShrink: 0 }}>
            {selectedDistrict ? (
              <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 15, textTransform: "capitalize" }}>
                  {selectedDistrict.DISTRICT.toLowerCase()}
                </h3>
                <div
                  style={{
                    display: "inline-block",
                    padding: "2px 10px",
                    borderRadius: 6,
                    background: selectedDistrict.fillColor,
                    color: "#fff",
                    fontSize: 12,
                    marginBottom: 10,
                  }}
                >
                  {selectedDistrict.riskLabel} · {selectedDistrict.riskScore}
                </div>
                <p style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>
                  From {selectedDistrict.sourceDistrict?.toLowerCase()} NCRB reporting ({selectedDistrict.sourceIncidents} incidents, 2022).
                </p>
                {selectedDistrict.isInherited && (
                  <p style={{ fontSize: 11, color: "#a66", background: "#fdf2e9", padding: "6px 8px", borderRadius: 6, marginTop: 6 }}>
                    ⚠ Estimated — no direct 2022 data for this district; using its parent district's rate as the closest available number.
                  </p>
                )}
              </div>
            ) : (
              <div style={{ border: "1px dashed #ddd", borderRadius: 12, padding: 16, color: "#999", fontSize: 12 }}>
                Click a district to see its real data.
              </div>
            )}
          </div>
        )}
      </div>

      <p style={{ fontSize: 12, color: "#888", marginTop: 12 }}>
        {layer === "historical"
          ? "Real Delhi Police district boundaries, colored by real NCRB 2022 crime data. Newer districts (Rohini, Dwarka, Outer, Outer North, Airport) inherit their parent reporting district's rate — NCRB data predates Delhi's 2019 district split."
          : "Real, individually source-cited incidents. Click a pin for details and citation."}
      </p>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, fontSize: 12, color: "#555" }}>
        <LegendItem color="#4A9B3D" label="Very Safe" />
        <LegendItem color="#97C459" label="Safe" />
        <LegendItem color="#EF9F27" label="Caution" />
        <LegendItem color="#D95B2B" label="Risky" />
        <LegendItem color="#791F1F" label="Avoid" />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";

import dynamic from "next/dynamic";
import { MapPinned, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@safe-her/ui/lib/utils";

import LocationSearch from "@/components/location-search";
import { AreaHoverTooltip } from "@/components/map-ui";
import {
  type HeatmapArea,
  findAreaForSearch,
  groupCellsIntoAreas,
  riskColor,
} from "@/lib/heatmap-areas";
import { type GeocodeResult, fetchHeatmap } from "@/lib/api";

const SafetyMap = dynamic(() => import("@/components/safety-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[min(70vh,560px)] min-h-[420px] items-center justify-center bg-zinc-100 text-xs text-muted-foreground">
      Loading map...
    </div>
  ),
});

const MAP_CENTER = { lat: 28.61, lng: 77.2 };

export default function HeatmapPage() {
  const [scores, setScores] = useState<HeatmapArea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<{
    center: { lat: number; lng: number };
    zoom: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHeatmap()
      .then((data) => {
        if (!cancelled) setScores(data);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const areas = useMemo(() => groupCellsIntoAreas(scores), [scores]);

  const points = useMemo(
    () =>
      areas.map((area) => {
        const tooltip = <AreaHoverTooltip area={area} />;
        return {
          id: area.id,
          lat: area.center.lat,
          lng: area.center.lng,
          color: riskColor(area.riskLevel),
          hover: tooltip,
          popup: tooltip,
        };
      }),
    [areas],
  );

  function clearSelection() {
    setSelectedAreaId(null);
    setFlyTarget(null);
  }

  function handleSearchSelect(result: GeocodeResult) {
    const point = { lat: result.lat, lng: result.lng };
    setSelectedAreaId(null);
    setFlyTarget(null);

    const matched = findAreaForSearch(result.displayName, point, areas);

    if (matched) {
      setSelectedAreaId(matched.id);
      setFlyTarget({ center: matched.center, zoom: 14 });
      return;
    }

    setFlyTarget({ center: point, zoom: 15 });
    toast("No risk data available for this area.");
  }

  const highCount = areas.filter((a) => a.riskLevel === "High").length;
  const medCount = areas.filter((a) => a.riskLevel === "Medium").length;
  const lowCount = areas.filter((a) => a.riskLevel === "Low").length;

  return (
    <main className="relative min-h-0 overflow-y-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_10%_0%,oklch(0.92_0.05_350),transparent_55%),radial-gradient(ellipse_60%_40%_at_90%_0%,oklch(0.94_0.04_20),transparent_50%)]"
      />

      <section className="mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-primary uppercase ring-1 ring-primary/15">
              <MapPinned className="size-3.5" />
              Live map
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Delhi safety heatmap
            </h1>
            <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
              Hover a pin for why that spot is scored that way. Risk blends community
              reports and recent news signals.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <StatPill label="High" value={highCount} tone="high" />
            <StatPill label="Medium" value={medCount} tone="medium" />
            <StatPill label="Low" value={lowCount} tone="low" />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-card shadow-xl shadow-pink-200/30 ring-1 ring-border/70 dark:shadow-none">
          {error ? (
            <div className="flex items-center gap-2 px-5 py-8 text-sm text-rose-600">
              <ShieldAlert className="size-4 shrink-0" />
              Failed to load heatmap: {error}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 p-3 pb-0">
              <LocationSearch
                onSelect={handleSearchSelect}
                placeholder="Search a Delhi locality or address…"
              />
              <div className="relative">
                <SafetyMap
                  center={MAP_CENTER}
                  height="min(70vh, 560px)"
                  zoom={11}
                  showLegend
                  points={points}
                  activePointId={selectedAreaId}
                  flyToTarget={flyTarget}
                  onMapClick={clearSelection}
                  onPointClick={(id) => {
                    setSelectedAreaId(id);
                    setFlyTarget(null);
                  }}
                  className="min-h-[420px] rounded-none"
                />
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "high" | "medium" | "low";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1",
        tone === "high" && "bg-rose-500/10 text-rose-700 ring-rose-500/15",
        tone === "medium" && "bg-amber-500/10 text-amber-800 ring-amber-500/15",
        tone === "low" && "bg-emerald-500/10 text-emerald-800 ring-emerald-500/15",
      )}
    >
      <span className="tabular-nums">{value}</span>
      <span className="font-medium opacity-80">{label}</span>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

import dynamic from "next/dynamic";
import { MapPinned, ShieldAlert } from "lucide-react";

import { cn } from "@safe-her/ui/lib/utils";

import { AreaHoverTooltip, RiskBadge } from "@/components/map-ui";
import {
  type HeatmapCell,
  groupCellsIntoAreas,
  riskColor,
} from "@/lib/heatmap-areas";
import { fetchHeatmap } from "@/lib/api";

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
  const [scores, setScores] = useState<HeatmapCell[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      areas.map((area) => ({
        id: area.id,
        lat: area.center.lat,
        lng: area.center.lng,
        color: riskColor(area.riskLevel),
        hover: <AreaHoverTooltip area={area} />,
      })),
    [areas],
  );

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
            <SafetyMap
              center={MAP_CENTER}
              height="min(70vh, 560px)"
              zoom={11}
              showLegend
              points={points}
              className="min-h-[420px] rounded-none"
            />
          )}
        </div>

        <div className="mt-8">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-xs font-semibold tracking-[0.16em] text-foreground uppercase">
              Areas
            </h2>
            <span className="text-xs text-muted-foreground">
              {areas.length} localities
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((area) => (
              <article
                key={area.id}
                className="flex flex-col gap-3 rounded-2xl bg-card/80 p-4 shadow-sm ring-1 ring-border/60 backdrop-blur-sm transition hover:shadow-md hover:ring-primary/15"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[14px] leading-snug font-semibold text-foreground">
                    {area.areaName}
                  </h3>
                  <RiskBadge level={area.riskLevel} compact />
                </div>

                {area.recentCategories.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {area.recentCategories.slice(0, 4).map((cat) => (
                      <span
                        key={cat}
                        className="rounded-md bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-muted-foreground">No recent incident tags</p>
                )}

                <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
                  <span>
                    {area.communityReportCount} community report
                    {area.communityReportCount === 1 ? "" : "s"}
                  </span>
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: riskColor(area.riskLevel) }}
                    aria-hidden
                  />
                </div>
              </article>
            ))}

            {areas.length === 0 && !error && (
              <div className="col-span-full rounded-2xl bg-card/70 px-6 py-12 text-center text-sm text-muted-foreground ring-1 ring-border/60">
                No risk zones loaded yet.
              </div>
            )}
          </div>
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

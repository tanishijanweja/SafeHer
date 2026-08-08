"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import dynamic from "next/dynamic";
import { ChevronRight, MapPinned, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@safe-her/ui/lib/utils";

import LocationSearch from "@/components/location-search";
import { AreaHoverTooltip, RiskBadge } from "@/components/map-ui";
import {
  type AreaRegion,
  type HeatmapArea,
  findAreaForSearch,
  formatDateTime,
  groupCellsIntoAreas,
  hasMeaningfulAreaData,
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

/** Only real external web links open in a new tab; synthetic/local ones are skipped. */
function externalLink(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://safeher.local");
    if (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.origin !== "https://safeher.local"
    ) {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

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

  // The map + search still use the full set of risk zones; only the cards list
  // is pruned — to localities that carry content AND have a real (Medium/High)
  // risk level — so genuine risk areas are never dropped and the map is intact.
  const risedAreas = useMemo(
    () =>
      areas.filter(
        (area) => area.riskLevel !== "Low" && hasMeaningfulAreaData(area),
      ),
    [areas],
  );

  // Locality whose detail popup is currently open.
  const [detailArea, setDetailArea] = useState<AreaRegion | null>(null);
  const closeDetail = useCallback(() => setDetailArea(null), []);

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

        <div className="mt-8">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-xs font-semibold tracking-[0.16em] text-foreground uppercase">
              Areas
            </h2>
            <span className="text-xs text-muted-foreground">
              {risedAreas.length} locality
              {risedAreas.length === 1 ? "" : "s"} with risk
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {risedAreas.map((area) => (
              <article
                key={area.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailArea(area)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDetailArea(area);
                  }
                }}
                className="flex cursor-pointer select-none flex-col gap-3 rounded-2xl bg-card/80 p-4 shadow-sm ring-1 ring-border/60 backdrop-blur-sm transition hover:shadow-md hover:ring-primary/15"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[14px] leading-snug font-semibold text-foreground">
                    {area.areaName}
                  </h3>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <RiskBadge level={area.riskLevel} compact />
                    <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                  </span>
                </div>

                {area.recentCategories.length > 0 && (
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
                )}

                <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
                  <span className="tabular-nums">
                    {area.newsIncidentCount > 0 && (
                      <>
                        {area.newsIncidentCount} news{area.newsIncidentCount === 1 ? "" : "s"}
                        {" · "}
                      </>
                    )}
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

            {!error && risedAreas.length === 0 && (
              <div className="col-span-full rounded-2xl bg-card/70 px-6 py-12 text-center text-sm text-muted-foreground ring-1 ring-border/60">
                {areas.length === 0
                  ? "No risk zones loaded yet."
                  : "No localities with Medium/High risk data yet."}
              </div>
            )}
          </div>
        </div>
      </section>

      {detailArea && (
        <LocalityDetailPopup area={detailArea} onClose={closeDetail} />
      )}
    </main>
  );
}

function LocalityDetailPopup({
  area,
  onClose,
}: {
  area: AreaRegion;
  onClose: () => void;
}) {
  const hasNews = area.newsArticles.length > 0;
  const hasCommunity = area.communityReports.length > 0;
  const hasHistory = !!area.historicalDistrict || area.demoHistorical.length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${area.areaName} details`}
    >
      <div
        className="my-8 w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              {area.areaName}
            </h2>
            <div className="mt-2">
              <RiskBadge level={area.riskLevel} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-foreground/60 uppercase">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
              News Articles
            </h3>
            {hasNews ? (
              <ul className="space-y-2.5">
                {area.newsArticles.slice(0, 6).map((article) => {
                  const href = externalLink(article.url);
                  const inner = (
                    <>
                      <span className="text-[13px] leading-snug font-medium text-foreground">
                        {article.title}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {article.sourceDomain ? (
                          <span className="font-semibold text-foreground/70">
                            {article.sourceDomain}
                          </span>
                        ) : null}
                        <span>{formatDateTime(article.publishedAt)}</span>
                        {href ? (
                          <span className="text-blue-600">↗</span>
                        ) : null}
                      </span>
                    </>
                  );
                  return (
                    <li
                      key={article.title}
                      className="rounded-xl border border-border/60 bg-muted/40 p-3"
                    >
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col gap-0.5 transition-opacity hover:opacity-80"
                        >
                          {inner}
                        </a>
                      ) : (
                        inner
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[12px] text-muted-foreground">No news coverage found.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-foreground/60 uppercase">
              <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
              Community Reports
            </h3>
            {hasCommunity ? (
              <ul className="space-y-2.5">
                {area.communityReports.slice(0, 5).map((report) => (
                  <li
                    key={report.title}
                    className="rounded-xl border border-border/60 bg-muted/40 p-3"
                  >
                    <span className="text-[13px] leading-snug font-medium text-foreground">
                      {report.title}
                    </span>
                    {(report.category || report.description) && (
                      <span className="mt-1 block text-[12px] leading-snug text-muted-foreground">
                        {report.category ? (
                          <span className="font-semibold text-foreground/70">
                            {report.category}
                            {report.description ? " — " : ""}
                          </span>
                        ) : null}
                        {report.description}
                      </span>
                    )}
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {report.incidentDate
                        ? `Incident: ${formatDateTime(report.incidentDate)}`
                        : `Reported: ${formatDateTime(report.createdAt)}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-muted-foreground">No community reports yet.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-foreground/60 uppercase">
              <span className="size-1.5 rounded-full bg-emerald-600" aria-hidden />
              Historical Data
            </h3>
            {hasHistory ? (
              <ul className="space-y-2.5">
                {area.historicalDistrict ? (
                  <li className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <span className="text-[13px] leading-snug font-semibold text-foreground">
                      {area.historicalDistrict}
                    </span>
                    {area.historicalSource ? (
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        Source: {area.historicalSource}
                      </span>
                    ) : null}
                  </li>
                ) : null}
                {area.demoHistorical.map((d) => (
                  <li
                    key={d.title}
                    className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3"
                  >
                    <span className="text-[13px] leading-snug font-semibold text-foreground">
                      {d.title}
                    </span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {formatDateTime(d.date)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                No historical records for this locality.
              </p>
            )}
          </section>
        </div>

        <div className="border-t border-border/70 px-5 py-3 text-[11px] text-muted-foreground">
          Last updated {formatDateTime(area.lastUpdated)}
        </div>
      </div>
    </div>
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

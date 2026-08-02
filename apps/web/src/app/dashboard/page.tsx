"use client";

import { HeartPulse, Megaphone, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@safe-her/ui/components/button";

import ReportCard from "@/components/report-card";
import RequireAuth from "@/components/require-auth";
import { SafeMap, type SafeHeatCell, type SafeMarker } from "@/components/safe-map";
import { EmptyState, SectionHeading, StatCard } from "@/components/ui-helpers";
import { useStoreVersion } from "@/lib/use-store";
import { REPORT_CATEGORIES, type ReportCategory } from "@/lib/types";
import { computeRiskScores, ensureSeeded, getReports, getStats } from "@/lib/store";
import { cn } from "@safe-her/ui/lib/utils";

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardBody />
    </RequireAuth>
  );
}

function DashboardBody() {
  useStoreVersion();
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState<ReportCategory | "all">("all");
  const [showHeat, setShowHeat] = useState(true);

  useEffect(() => {
    ensureSeeded();
    setReady(true);
  }, []);

  if (!ready) return null;

  const reports = getReports();
  const filtered = category === "all" ? reports : reports.filter((r) => r.category === category);
  const nonSpam = filtered.filter((r) => !r.is_spam);

  const heat: SafeHeatCell[] = computeRiskScores().map((r) => ({
    lat: r.latitude,
    lng: r.longitude,
    score: r.combined_score,
  }));
  const markers: SafeMarker[] = nonSpam.slice(0, 40).map((r) => ({
    id: r.id,
    lat: r.latitude,
    lng: r.longitude,
    kind: "report",
    severity: r.severity,
  }));

  const stats = getStats();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Live safety overview</h1>
          <p className="text-xs text-muted-foreground/50">Community risk across Delhi, updated in real time.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/reports/new">
            <Button className="h-9 rounded-full bg-pink-500 text-xs font-semibold text-white shadow-lg">
              <Plus className="size-4" /> Report incident
            </Button>
          </Link>
          <Link href="/sos">
            <Button
              variant="outline"
              className="h-9 rounded-full border-rose-400/40 bg-rose-500/10 text-xs font-semibold text-rose-200"
            >
              <HeartPulse className="size-4" /> SOS
            </Button>
          </Link>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Total reports" value={stats.reports} hint="across Delhi" />
        <StatCard label="Verified" value={stats.corroborated} hint="community corroborated" accent="emerald" />
        <StatCard label="Hotspots" value={stats.hotspots} hint="risk ≥ 3 / 5" accent="rose" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Map panel */}
        <div className="overflow-hidden rounded-2xl border border-pink-400/15 bg-card/80">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pink-400/15 bg-card/80 px-3 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowHeat((v) => !v)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-medium transition",
                  showHeat
                    ? "bg-pink-500/20 text-foreground ring-1 ring-pink-400/40"
                    : "text-muted-foreground/50 hover:bg-pink-500/10",
                )}
              >
                Risk heat
              </button>
              <span className="hidden text-[10px] text-muted-foreground/40 sm:inline">drag · scroll to zoom</span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
                All
              </FilterChip>
              {REPORT_CATEGORIES.slice(0, 6).map((c) => (
                <FilterChip key={c.value} active={category === c.value} onClick={() => setCategory(c.value)}>
                  {c.label}
                </FilterChip>
              ))}
            </div>
          </div>
          <div className="h-[520px]">
            <SafeMap heat={showHeat ? heat : []} markers={markers} />
          </div>
        </div>

        {/* Recent reports */}
        <div>
          <SectionHeading
            title="Recent reports"
            action={
              <Link href="/reports" className="text-[11px] text-primary hover:underline">
                View all →
              </Link>
            }
          />
          <div className="flex flex-col gap-3">
            {nonSpam.length === 0 ? (
              <EmptyState title="No reports here yet" hint="Be the first to report in this category." />
            ) : (
              nonSpam.slice(0, 6).map((r) => <ReportCard key={r.id} report={r} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition",
        active
          ? "border-pink-400/50 bg-pink-500/20 text-foreground"
          : "border-pink-400/15 text-muted-foreground/50 hover:bg-pink-500/10",
      )}
    >
      {children}
    </button>
  );
}

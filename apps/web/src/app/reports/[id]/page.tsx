"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Loader2,
  MapPin,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@safe-her/ui/components/button";

import RequireAuth from "@/components/require-auth";
import { SafeMap, type SafeHeatCell, type SafeMarker } from "@/components/safe-map";
import { CategoryChip, EmptyState, SeverityBadge, StatusPill } from "@/components/ui-helpers";
import { useStoreVersion } from "@/lib/use-store";
import { geohashEncode, formatDateTime } from "@/lib/geo";
import {
  computeRiskScores,
  corroborateReport,
  ensureSeeded,
  getNearbyPlaces,
  getReport,
  getReports,
  toggleSpam,
} from "@/lib/store";
import { categoryLabel, REPORT_CATEGORIES, type Report } from "@/lib/types";

export default function ReportDetailPage() {
  return (
    <RequireAuth>
      <ReportDetail />
    </RequireAuth>
  );
}

function ReportDetail() {
  useStoreVersion();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [ready, setReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    ensureSeeded();
    setReady(true);
  }, []);

  if (!ready) return null;

  const report = getReport(id);

  if (!report) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState title="Report not found" hint="It may have been removed." />
        <div className="mt-4 text-center">
          <Link href="/reports" className="text-xs text-primary hover:underline">
            ← Back to all reports
          </Link>
        </div>
      </div>
    );
  }

  const heat: SafeHeatCell[] = computeRiskScores().map((r) => ({
    lat: r.latitude,
    lng: r.longitude,
    score: r.combined_score,
  }));
  const markers: SafeMarker[] = [
    { id: report.id, lat: report.latitude, lng: report.longitude, kind: "pin", color: report.is_spam ? "#94a3b8" : undefined },
    ...getNearbyPlaces()
      .filter((p) => Math.abs(p.latitude - report.latitude) < 0.35 && Math.abs(p.longitude - report.longitude) < 0.35)
      .slice(0, 6)
      .map((p) => ({
        id: p.id,
        lat: p.latitude,
        lng: p.longitude,
        kind: p.type as "police" | "hospital",
        label: p.type === "police" ? "P" : "H",
      })),
  ];

  const related = getReports()
    .filter((r) => r.id !== report.id && r.category === report.category && !r.is_spam)
    .slice(0, 3);

  const onCorroborate = () => {
    const updated = corroborateReport(report.id);
    if (updated?.status === "community-corroborated") {
      toast.success("2+ users corroborated — report is now community verified");
    } else {
      toast.success("Corroboration counted");
    }
  };

  const onToggleSpam = () => {
    const updated = toggleSpam(report.id);
    toast.success(updated?.is_spam ? "Marked as spam (hidden from the map)" : "Un-marked as spam");
  };

  const onReanalyze = async () => {
    setAnalyzing(true);
    // Simulated AI re-run on the full text with fresh analysis
    const { analyzeReport } = await import("@/lib/ai");
    const result = await analyzeReport(report.description);
    toast.success(`AI re-analysis: severity ${result.severity}/5 · ${result.is_spam ? "spam" : "genuine"}`);
    setAnalyzing(false);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/reports" className="mb-4 inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Main column */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-pink-400/15 bg-card/80 p-4">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <h1 className="max-w-xl text-lg font-bold leading-snug text-foreground">{report.title}</h1>
              <SeverityBadge severity={report.severity} size="lg" />
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <CategoryChip icon={categoryIcon(report.category)} label={categoryLabel(report.category)} />
              <StatusPill status={report.status} />
              {report.is_spam ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-medium text-rose-200">
                  <AlertTriangle className="size-3" /> Marked spam
                </span>
              ) : null}
            </div>

            <p className="text-sm leading-relaxed text-foreground/80">{report.description}</p>

            {report.image_url ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-pink-400/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={report.image_url} alt={report.title} className="max-h-96 w-full object-cover" />
              </div>
            ) : null}
          </div>

          {/* Location */}
          <div className="overflow-hidden rounded-2xl border border-pink-400/15 bg-card/80">
            <div className="flex items-center gap-1.5 border-b border-pink-400/15 bg-card/80 px-3 py-2 text-xs font-medium text-foreground">
              <MapPin className="size-4 text-primary" /> Incident location & nearby emergency services
            </div>
            <div className="h-72">
              <SafeMap heat={heat} markers={markers} center={{ lat: report.latitude, lng: report.longitude }} initialZoom={14} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-pink-400/15 bg-card/80 px-3 py-2 font-mono text-[11px] text-muted-foreground/70">
              <span>{report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}</span>
              <span>geohash-6: {geohashEncode(report.latitude, report.longitude, 6)}</span>
              <span>Reported {formatDateTime(report.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Side column */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-pink-400/15 bg-card/80 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-foreground">Actions</h2>
            <div className="flex flex-col gap-2">
              <Button
                onClick={onCorroborate}
                className="h-10 w-full rounded-full bg-pink-500 text-xs font-semibold text-white shadow-lg"
              >
                <UsersRound className="size-4" /> I was here too — corroborate
              </Button>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground/50">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" /> {report.corroborations} corroboration{report.corroborations === 1 ? "" : "s"}
                </span>
                <span>needs 2 to verify</span>
              </div>
              <Button
                variant="outline"
                onClick={onReanalyze}
                disabled={analyzing}
                className="h-9 w-full rounded-full border-pink-400/30 text-foreground"
              >
                {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
                Re-run AI analysis
              </Button>
              <Button
                variant="outline"
                onClick={onToggleSpam}
                className="h-9 w-full rounded-full border-rose-400/30 text-rose-200 hover:bg-rose-500/10"
              >
                <ShieldAlert className="size-4" />
                {report.is_spam ? "Un-mark spam" : "Flag as spam"}
              </Button>
            </div>
          </div>

          {related.length > 0 ? (
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-foreground">
                Similar reports
              </h2>
              <div className="flex flex-col gap-2">
                {related.map((r) => (
                  <RelatedLink key={r.id} report={r} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RelatedLink({ report }: { report: Report }) {
  return (
    <Link
      href={`/reports/${report.id}`}
      className="rounded-xl border border-pink-400/15 bg-card/80 p-3 transition hover:border-pink-400/40 hover:bg-pink-500/5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="line-clamp-1 text-xs font-medium text-foreground">{report.title}</span>
        <SeverityBadge severity={report.severity} />
      </div>
      <span className="text-[10px] text-muted-foreground/40">{formatDateTime(report.created_at)}</span>
    </Link>
  );
}

function categoryIcon(category: Report["category"]): string {
  return REPORT_CATEGORIES.find((c) => c.value === category)?.icon ?? "ellipsis";
}

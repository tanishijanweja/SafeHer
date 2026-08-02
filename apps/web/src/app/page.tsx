"use client";

import { ArrowRight, HeartPulse, MapPinned, Megaphone, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@safe-her/ui/components/button";

import { SafeMap, type SafeHeatCell, type SafeMarker } from "@/components/safe-map";
import { SeverityBadge, StatCard, StatusPill } from "@/components/ui-helpers";
import { categoryLabel, type Report } from "@/lib/types";
import { useStoreVersion } from "@/lib/use-store";
import { computeRiskScores, ensureSeeded, getReports, getStats } from "@/lib/store";
import { timeAgo } from "@/lib/geo";

export default function HomePage() {
  useStoreVersion();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureSeeded();
    setReady(true);
  }, []);

  if (!ready) return null;

  const reports = getReports();
  const stats = getStats();
  const heat: SafeHeatCell[] = computeRiskScores().map((r) => ({
    lat: r.latitude,
    lng: r.longitude,
    score: r.combined_score,
  }));
  const markers: SafeMarker[] = reports
    .filter((r) => !r.is_spam)
    .slice(0, 24)
    .map((r) => ({
      id: r.id,
      lat: r.latitude,
      lng: r.longitude,
      kind: "report",
      severity: r.severity,
    }));

  return (
    <div className="safeher-glow">
      <div className="mx-auto max-w-6xl px-4">
        {/* Hero */}
        <section className="grid items-center gap-8 py-14 md:grid-cols-2 md:py-20">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-pink-400/30 bg-pink-500/10 px-3 py-1 text-[11px] uppercase tracking-widest text-muted-foreground">
              <ShieldCheck className="size-3.5" /> AI-powered community safety
            </div>
            <h1 className="text-4xl font-bold leading-tight text-foreground md:text-5xl">
              Know your streets.
              <br />
              <span className="text-gradient-pink">Stay ahead of danger.</span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground/70">
              SafeHer turns community reports into a live risk map of Delhi. Report what you see,
              trigger an instant SOS, and let your trusted contacts know you&apos;re safe — all in
              one place.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/reports/new">
                <Button className="h-10 rounded-full bg-pink-500 px-5 text-sm font-semibold text-white shadow-lg hover:bg-pink-600">
                  <Megaphone className="size-4" /> Report an incident
                </Button>
              </Link>
              <Link href="/sos">
                <Button className="h-10 rounded-full bg-red-600 px-5 text-sm font-semibold text-white shadow-lg hover:bg-red-500">
                  <HeartPulse className="size-4 animate-pulse-slow" /> Panic SOS
                </Button>
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-4 text-[11px] text-muted-foreground/50">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-pink-400" /> {stats.reports} community reports
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-rose-400" /> {stats.hotspots} live hotspots
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-400" /> {stats.corroborated} verified
              </span>
            </div>
          </div>

          <div className="safeher-card-glow overflow-hidden rounded-2xl border border-pink-400/20">
            <div className="flex items-center justify-between border-b border-pink-400/15 bg-card/80 px-4 py-2.5">
              <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                <MapPinned className="size-4 text-primary" /> Delhi live risk map
              </span>
              <Link href="/dashboard" className="text-[11px] text-primary hover:underline">
                Open full map →
              </Link>
            </div>
            <div className="h-72">
              <SafeMap heat={heat} markers={markers} interactive={false} />
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 gap-3 pb-10 md:grid-cols-3">
          <StatCard label="Total reports" value={stats.reports} accent="pink" />
          <StatCard label="Community verified" value={stats.corroborated} accent="emerald" />
          <StatCard label="Avg severity (1–5)" value={stats.avgSeverity} accent="rose" />
        </section>

        {/* How it works */}
        <section className="pb-12">
          <h2 className="mb-5 text-center text-sm font-semibold uppercase tracking-widest text-foreground">
            How SafeHer works
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                icon: Megaphone,
                title: "1 · You report",
                body: "Describe what happened, drop a pin on the map and add a photo. It takes under a minute.",
              },
              {
                icon: ShieldCheck,
                title: "2 · AI analyses",
                body: "Gemini grades severity, flags spam and updates the risk score for that exact grid cell.",
              },
              {
                icon: HeartPulse,
                title: "3 · SOS in danger",
                body: "One tap sends your live location to trusted contacts and shows the nearest police and hospitals.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-xl border border-pink-400/15 bg-card/80 p-4 transition hover:border-pink-400/40 hover:bg-pink-500/5"
              >
                <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-pink-500/15 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="mb-1 text-sm font-semibold text-foreground">{title}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground/60">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Recent reports */}
        <section className="pb-16">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-foreground">
              Recent reports
            </h2>
            <Link href="/reports" className="flex items-center gap-1 text-[11px] text-primary hover:underline">
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {reports
              .filter((r) => !r.is_spam)
              .slice(0, 3)
              .map((r) => (
                <RecentReportCard key={r.id} report={r} />
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function RecentReportCard({ report }: { report: Report }) {
  return (
    <Link
      href={`/reports/${report.id}`}
      className="group rounded-xl border border-pink-400/15 bg-card/80 p-4 transition hover:border-pink-400/40 hover:bg-pink-500/5"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <SeverityBadge severity={report.severity} />
        <StatusPill status={report.status} />
      </div>
      <h3 className="line-clamp-1 text-sm font-semibold text-foreground group-hover:text-muted-foreground">
        {report.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground/60">
        {report.description}
      </p>
      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground/40">
        <span>{categoryLabel(report.category)}</span>
        <span className="flex items-center gap-1">
          <UsersRound className="size-3" /> {timeAgo(report.created_at)}
        </span>
      </div>
    </Link>
  );
}

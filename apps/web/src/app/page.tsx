"use client";

import { useEffect, useMemo, useState } from "react";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight,
  HeartPulse,
  MapPin,
  Megaphone,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { cn } from "@safe-her/ui/lib/utils";

import {
  type Report,
  fetchHeatmap,
  fetchReports,
  formatCategory,
  relativeTimeShort,
  severityLabel,
} from "@/lib/api";
import { AreaHoverTooltip } from "@/components/map-ui";
import HelplineMarquee from "@/components/helpline-marquee";
import LoginPrompt from "@/components/login-prompt";
import TrustedContactsOnboarding from "@/components/trusted-contacts-onboarding";
import {
  type HeatmapArea,
  groupCellsIntoAreas,
  riskColor,
} from "@/lib/heatmap-areas";

const SafetyMap = dynamic(() => import("@/components/safety-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[280px] items-center justify-center bg-zinc-100 text-xs text-muted-foreground">
      Loading map...
    </div>
  ),
});

const MAP_CENTER = { lat: 28.61, lng: 77.2 };

// TODO: remove once reports + heatmap always return data in empty environments
const DEMO_REPORTS: Report[] = [
  {
    id: "demo-1",
    userId: "demo",
    title: "Dark stretch at Hauz Khas Village side lane",
    description:
      "The lane connecting Hauz Khas village to the lake is completely dark after 10 pm. Multiple streetlights are broken...",
    category: "Dark Alley / Isolated Spot",
    severity: 3,
    latitude: 28.5494,
    longitude: 77.2001,
    imageUrl: null,
    aiSummary: null,
    isSpam: false,
    confidenceLevel: "UNVERIFIED",
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    geohash: "",
  },
  {
    id: "demo-2",
    userId: "demo",
    title: "Late night harassment at Nehru Place bus queue",
    description:
      "While waiting for a bus at Nehru Place around 11:30 pm, a man kept brushing against women in the queue. No cctv...",
    category: "HARASSMENT",
    severity: 3,
    latitude: 28.5491,
    longitude: 77.253,
    imageUrl: null,
    aiSummary: null,
    isSpam: false,
    confidenceLevel: "UNVERIFIED",
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    geohash: "",
  },
  {
    id: "demo-3",
    userId: "demo",
    title: "Cable strung across footpath in Rohini",
    description:
      "A torn cable hangs across the footpath near Rohini Sector 7 market. In the dark it is invisible and could easily electrocute...",
    category: "Poor Lighting",
    severity: 2,
    latitude: 28.7495,
    longitude: 77.1195,
    imageUrl: null,
    aiSummary: null,
    isSpam: false,
    confidenceLevel: "UNVERIFIED",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    geohash: "",
  },
];

function SeverityDots({ severity }: { severity: number }) {
  const label = severityLabel(severity);
  const filled = label === "Mild" ? 2 : label === "Moderate" ? 3 : 4;
  const color =
    label === "Mild"
      ? "bg-zinc-400"
      : label === "Moderate"
        ? "bg-pink-400"
        : "bg-rose-500";

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border/60">
      <span className="inline-flex items-center gap-0.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "size-1.5 rounded-full",
              i < filled ? color : "bg-zinc-200 dark:bg-zinc-600",
            )}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

function ConfidenceBadge({ level }: { level: Report["confidenceLevel"] }) {
  const verified = level === "COMMUNITY_CORROBORATED";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        verified
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80"
          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          verified ? "bg-emerald-500" : "bg-amber-400",
        )}
      />
      {verified ? "Verified" : "Unverified"}
    </span>
  );
}

export default function Home() {
  const [reports, setReports] = useState<Report[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapArea[]>([]);
  const [usingDemo, setUsingDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [r, h] = await Promise.all([fetchReports(), fetchHeatmap()]);
        if (cancelled) return;
        setReports(r.filter((x) => !x.isSpam));
        setHeatmap(h);
        setUsingDemo(r.length === 0 && h.length === 0);
      } catch {
        if (cancelled) return;
        // TODO: surface toast once global toast is wired for offline API
        setReports([]);
        setHeatmap([]);
        setUsingDemo(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayReports = reports.length > 0 ? reports : usingDemo ? DEMO_REPORTS : [];
  const recent = displayReports.slice(0, 3);

  const totalReports = displayReports.length;
  const verifiedCount = displayReports.filter(
    (r) => r.confidenceLevel === "COMMUNITY_CORROBORATED",
  ).length;
  const avgSeverity =
    totalReports === 0
      ? 0
      : displayReports.reduce((s, r) => s + (r.severity || 0), 0) / totalReports;

  const areas = useMemo(() => groupCellsIntoAreas(heatmap), [heatmap]);

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

  const liveHotspotCount = areas.filter((a) => a.riskLevel !== "Low").length;

  return (
    <main className="relative min-h-0 overflow-y-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_10%_0%,oklch(0.92_0.05_350),transparent_55%),radial-gradient(ellipse_70%_50%_at_90%_10%,oklch(0.94_0.04_20),transparent_50%),radial-gradient(ellipse_60%_40%_at_50%_100%,oklch(0.95_0.03_350),transparent_55%)]"
      />

      <HelplineMarquee />

      <LoginPrompt />

      <section className="mx-auto max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pt-14 lg:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col gap-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-primary uppercase ring-1 ring-primary/15">
              <ShieldCheck className="size-3.5" strokeWidth={2.25} />
              AI-Powered Community Safety
            </div>

            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
                Know your streets.
              </h1>
              <p className="text-4xl font-bold tracking-tight text-primary sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
                Stay ahead of danger.
              </p>
            </div>

            <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground">
              SafeHer turns community reports into a live risk map of Delhi. Report what
              you see, trigger an instant SOS, and let your trusted contacts know
              you&apos;re safe — all in one place.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/reports"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:bg-primary/90"
              >
                <Megaphone className="size-4" />
                Report an incident
              </Link>
              <Link
                href="/sos"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-safeher-rose px-5 text-sm font-semibold text-white shadow-md shadow-rose-500/30 transition hover:brightness-110"
              >
                <HeartPulse className="size-4" />
                Panic SOS
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-pink-400" />
                {totalReports} community reports
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-rose-400" />
                {liveHotspotCount} live hotspots
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" />
                {verifiedCount} verified
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-2xl bg-card shadow-xl shadow-pink-200/40 ring-1 ring-border/70 dark:shadow-none">
              <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-gradient-to-r from-primary/[0.04] to-transparent px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
                    <MapPin className="size-3.5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Delhi live risk map</div>
                    <div className="text-[11px] text-muted-foreground">
                      Hover pins · community + news risk
                    </div>
                  </div>
                </div>
                <Link
                  href="/heatmap"
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/15"
                >
                  Full map
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <SafetyMap
                center={MAP_CENTER}
                height={340}
                zoom={11}
                zoomControl={false}
                showLegend
                points={points}
                className="rounded-none"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Total reports" value={String(totalReports)} tone="pink" />
          <StatCard
            label="Community verified"
            value={String(verifiedCount)}
            tone="green"
          />
          <StatCard
            label="Avg severity (1–5)"
            value={avgSeverity ? avgSeverity.toFixed(1) : "—"}
            tone="orange"
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <h2 className="mb-6 text-center text-xs font-semibold tracking-[0.18em] text-foreground uppercase">
          How SafeHer works
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <HowCard
            step="1"
            title="You report"
            icon={<Megaphone className="size-4" />}
            body="Describe what happened, drop a pin on the map and add a photo. It takes under a minute."
          />
          <HowCard
            step="2"
            title="AI analyses"
            icon={<ShieldCheck className="size-4" />}
            body="Gemini grades severity, flags spam and updates the risk score for that exact grid cell."
          />
          <HowCard
            step="3"
            title="SOS in danger"
            icon={<HeartPulse className="size-4" />}
            body="One tap sends your live location to trusted contacts and shows the nearest police and hospitals."
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold tracking-[0.18em] text-foreground uppercase">
            Recent reports
          </h2>
          <Link
            href="/reports"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
          >
            View all
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {recent.map((report, idx) => (
            <article
              key={report.id}
              className={cn(
                "flex flex-col gap-3 rounded-2xl bg-card/80 p-4 shadow-sm ring-1 ring-border/60 backdrop-blur-sm transition hover:shadow-md hover:ring-primary/20",
                idx === 1 && "bg-primary/[0.06]",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <SeverityDots severity={report.severity} />
                <ConfidenceBadge level={report.confidenceLevel} />
              </div>
              <h3 className="text-[15px] leading-snug font-semibold text-foreground">
                {report.title}
              </h3>
              <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
                {report.description}
              </p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground">
                <span>{formatCategory(report.category)}</span>
                <span className="inline-flex items-center gap-1">
                  <UserRound className="size-3 opacity-70" />
                  {relativeTimeShort(report.createdAt)}
                </span>
              </div>
            </article>
          ))}

          {recent.length === 0 && (
            <div className="col-span-full rounded-2xl bg-card/70 px-6 py-10 text-center text-sm text-muted-foreground ring-1 ring-border/60">
              No community reports yet. Be the first to{" "}
              <Link href="/reports" className="font-medium text-primary hover:underline">
                report an incident
              </Link>
              .
            </div>
          )}
        </div>
      </section>

      <TrustedContactsOnboarding />
    </main>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "pink" | "green" | "orange";
}) {
  const valueClass =
    tone === "pink"
      ? "text-primary"
      : tone === "green"
        ? "text-safeher-verified"
        : "text-safeher-severity";

  return (
    <div className="rounded-2xl bg-card/75 px-5 py-5 shadow-sm ring-1 ring-border/50 backdrop-blur-sm">
      <div className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className={cn("mt-2 text-3xl font-bold tracking-tight", valueClass)}>{value}</div>
    </div>
  );
}

function HowCard({
  step,
  title,
  body,
  icon,
}: {
  step: string;
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card/80 p-5 shadow-sm ring-1 ring-border/60 backdrop-blur-sm">
      <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="text-[15px] font-semibold text-foreground">
        <span className="text-primary">{step}</span>
        <span className="mx-1.5 text-muted-foreground/50">·</span>
        {title}
      </h3>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

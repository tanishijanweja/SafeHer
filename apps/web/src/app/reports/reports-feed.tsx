"use client";

import { useEffect, useMemo, useState } from "react";

import { ExternalLink, Inbox, MapPin, Newspaper, Search, ShieldCheck, UserRound } from "lucide-react";

import { cn } from "@safe-her/ui/lib/utils";

import {
  type NewsArticle,
  type Report,
  fetchNews,
  fetchReports,
  formatCategory,
  relativeTimeShort,
} from "@/lib/api";

type FeedItem = {
  kind: "report" | "news";
  id: string;
  title: string;
  description: string;
  category: string;
  severity: number;
  date: string;
  location: string;
  source: string | null;
  url: string | null;
  verified: boolean;
};

const CATEGORY_FILTERS = [
  { value: "all", label: "All categories" },
  { value: "harassment", label: "Harassment" },
  { value: "theft", label: "Theft / Robbery" },
  { value: "assault", label: "Assault" },
  { value: "poor-lighting", label: "Poor Lighting" },
  { value: "dark-alley", label: "Dark Alley / Isolated Spot" },
  { value: "unsafe-transit", label: "Unsafe Transit" },
  { value: "stalking", label: "Stalking / Following" },
  { value: "unsafe-area", label: "Unsafe Area" },
  { value: "other", label: "Other" },
] as const;

const SEVERITY_FILTERS = [
  { value: "any", label: "Any severity" },
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const;

const SPECIFIC_CATEGORY_KEYWORDS: Array<{ value: string; keywords: string[] }> = [
  { value: "harassment", keywords: ["harassment", "sexual", "eve teasing", "eve-teasing"] },
  { value: "theft", keywords: ["theft", "robbery", "snatch", "snatching", "pickpocket"] },
  {
    value: "assault",
    keywords: ["assault", "homicide", "stabbing", "beaten", "violence", "kidnap", "attack"],
  },
  {
    value: "poor-lighting",
    keywords: ["poor lighting", "poor_lighting", "streetlight", "unlit", "lighting"],
  },
  {
    value: "dark-alley",
    keywords: ["dark alley", "dark_alley", "isolated spot", "isolated"],
  },
  {
    value: "unsafe-transit",
    keywords: ["transit", "metro", "railway", "bus stop", "bus queue", "station", "cab"],
  },
  {
    value: "stalking",
    keywords: ["stalk", "stalking", "following", "followed"],
  },
  {
    value: "unsafe-area",
    keywords: ["unsafe area", "unsafe_area", "unsafe"],
  },
];

function categoryFilterValue(category: string): string {
  const n = category.toLowerCase();
  for (const c of SPECIFIC_CATEGORY_KEYWORDS) {
    if (c.keywords.some((k) => n.includes(k))) return c.value;
  }
  return "other";
}

function severityFilterValue(severity: number): string {
  if (severity <= 2) return "mild";
  if (severity <= 3) return "moderate";
  if (severity <= 4) return "high";
  return "critical";
}

const NEWS_CATEGORY_LABELS: Record<string, string> = {
  sexual_violence: "Sexual Violence",
  harassment: "Harassment",
  domestic_violence: "Domestic Violence",
  kidnapping: "Kidnapping",
  homicide_assault: "Assault",
  robbery_theft: "Robbery / Theft",
  other_crime: "Other Crime",
  not_incident: "Other",
};

function displayCategory(item: FeedItem): string {
  if (item.kind === "news" && NEWS_CATEGORY_LABELS[item.category]) {
    return NEWS_CATEGORY_LABELS[item.category]!;
  }
  return formatCategory(item.category);
}

function severityTone(severity: number): { label: string; dot: string } {
  if (severity <= 2) return { label: "Mild", dot: "bg-zinc-400" };
  if (severity <= 3) return { label: "Moderate", dot: "bg-pink-400" };
  if (severity <= 4) return { label: "High", dot: "bg-rose-500" };
  return { label: "Critical", dot: "bg-red-600" };
}

function fallbackLocation(lat: number, lng: number): string {
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

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

export default function ReportsFeed() {
  const [reports, setReports] = useState<Report[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("any");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchReports(), fetchNews()])
      .then(([r, n]) => {
        if (cancelled) return;
        setReports(r.filter((x) => !x.isSpam));
        setNews(n);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo<FeedItem[]>(() => {
    const reportItems: FeedItem[] = reports.map((r) => ({
      kind: "report",
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      severity: r.severity,
      date: r.createdAt,
      location: r.areaName ?? fallbackLocation(r.latitude, r.longitude),
      source: null,
      url: null,
      verified: r.confidenceLevel === "COMMUNITY_CORROBORATED",
    }));
    const newsItems: FeedItem[] = news.map((n) => ({
      kind: "news",
      id: n.id,
      title: n.title,
      description: "",
      category: n.category ?? "other_crime",
      severity: n.severity,
      date: n.publishedAt,
      location: n.localityName || fallbackLocation(n.latitude, n.longitude),
      source: n.sourceDomain,
      url: n.url,
      verified: n.confidence >= 0.5,
    }));
    return [...reportItems, ...newsItems].sort((a, b) => b.date.localeCompare(a.date));
  }, [reports, news]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== "all" && categoryFilterValue(item.category) !== category) return false;
      if (severity !== "any" && severityFilterValue(item.severity) !== severity) return false;
      if (verifiedOnly && !item.verified) return false;
      if (q) {
        const haystack = `${item.title} ${item.description} ${item.location} ${item.source ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, query, category, severity, verifiedOnly]);

  const reportCount = filtered.filter((i) => i.kind === "report").length;
  const newsCount = filtered.filter((i) => i.kind === "news").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 space-y-2">
        <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-primary uppercase ring-1 ring-primary/15">
          <Newspaper className="size-3.5" />
          Reports & News
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Community reports and news
        </h1>
        <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
          A live feed of community incident reports and recent news coverage. Filter
          by category, severity and verification status.
        </p>
      </div>

      <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-card/80 p-3 shadow-sm ring-1 ring-border/60 backdrop-blur-sm sm:p-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search incidents, locations or sources…"
            aria-label="Search reports and news"
            className="h-10 w-full rounded-2xl border border-input bg-background pr-3 pl-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto] lg:items-center">
          <FilterSelect
            value={category}
            onChange={setCategory}
            options={CATEGORY_FILTERS}
            ariaLabel="Filter by category"
          />
          <FilterSelect
            value={severity}
            onChange={setSeverity}
            options={SEVERITY_FILTERS}
            ariaLabel="Filter by severity"
          />
          <button
            type="button"
            onClick={() => setVerifiedOnly((v) => !v)}
            aria-pressed={verifiedOnly}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-2xl border px-3.5 text-sm font-medium transition-colors",
              verifiedOnly
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-input bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            <ShieldCheck className="size-4" aria-hidden />
            Verified
            {verifiedOnly ? <span className="size-1.5 rounded-full bg-primary" aria-hidden /> : null}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <FeedCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-card/70 px-6 py-12 text-center text-sm text-rose-600 ring-1 ring-border/60">
          Failed to load reports & news. Please try again.
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-card/70 px-6 py-14 text-center ring-1 ring-border/60">
          <Inbox className="size-8 text-muted-foreground/50" aria-hidden />
          <p className="text-sm text-muted-foreground">
            No items match your filters. Try clearing or changing them.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              {filtered.length} item{filtered.length === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500" aria-hidden />
              {reportCount} community {reportCount === 1 ? "report" : "reports"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-sky-500" aria-hidden />
              {newsCount} news {newsCount === 1 ? "article" : "articles"}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => (
              <FeedCard key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FeedCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card/80 p-4 ring-1 ring-border/60">
      <div className="flex items-center justify-between gap-2">
        <SkeletonBar className="h-5 w-28 rounded-full" />
        <SkeletonBar className="h-5 w-16 rounded-full" />
      </div>
      <SkeletonBar className="h-4 w-3/4 rounded-md" />
      <SkeletonBar className="h-3 w-full rounded-md" />
      <SkeletonBar className="h-3 w-2/3 rounded-md" />
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
        <SkeletonBar className="h-3 w-24 rounded-md" />
        <SkeletonBar className="h-3 w-20 rounded-md" />
      </div>
    </div>
  );
}

function SkeletonBar({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-foreground/10", className)} aria-hidden />;
}

function FilterSelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  ariaLabel: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="h-10 w-full cursor-pointer rounded-2xl border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
  const tone = severityTone(item.severity);
  const href = item.kind === "news" ? externalLink(item.url) : null;
  const isNews = item.kind === "news";

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-2xl bg-card/80 p-4 shadow-sm ring-1 ring-border/60 backdrop-blur-sm transition hover:shadow-md",
        isNews ? "hover:ring-sky-300/40" : "hover:ring-primary/20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase ring-1",
            isNews
              ? "bg-sky-50 text-sky-700 ring-sky-200/70 dark:bg-sky-950/40 dark:text-sky-300"
              : "bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300",
          )}
        >
          {isNews ? <Newspaper className="size-3" /> : <UserRound className="size-3" />}
          {isNews ? "News Article" : "Community Report"}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border/60 dark:bg-muted/40">
          <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
          {tone.label}
        </span>
      </div>

      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-start gap-1.5"
        >
          <h3 className="text-[15px] leading-snug font-semibold text-foreground transition group-hover:text-primary">
            {item.title}
          </h3>
          <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
        </a>
      ) : (
        <h3 className="text-[15px] leading-snug font-semibold text-foreground">{item.title}</h3>
      )}

      {!isNews && item.description ? (
        <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
          {item.description}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
        <span className="rounded-md bg-muted/80 px-1.5 py-0.5 font-semibold text-foreground/80">
          {displayCategory(item)}
        </span>

        {isNews && item.source ? (
          <span className="truncate font-semibold text-foreground/80">{item.source}</span>
        ) : null}

        {item.location ? (
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="size-3 shrink-0 opacity-70" aria-hidden />
            <span className="truncate">{item.location}</span>
          </span>
        ) : null}

        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
          {item.verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300">
              <ShieldCheck className="size-2.5" aria-hidden />
              Verified
            </span>
          ) : null}
          <span className="tabular-nums">
            {isNews ? "Published " : ""}
            {relativeTimeShort(item.date)}
          </span>
        </span>
      </div>
    </article>
  );
}

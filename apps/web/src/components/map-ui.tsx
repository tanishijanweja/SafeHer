"use client";

import { useState } from "react";

import { cn } from "@safe-her/ui/lib/utils";

import {
  type AreaRegion,
  type NewsArticleRef,
  type RiskLevel,
  formatDateTime,
  riskColor,
} from "@/lib/heatmap-areas";

const RISK_BADGE: Record<
  RiskLevel,
  { text: string; bg: string; ring: string }
> = {
  High: { text: "text-rose-700", bg: "bg-rose-500/10", ring: "ring-rose-500/25" },
  Medium: { text: "text-amber-800", bg: "bg-amber-500/10", ring: "ring-amber-500/25" },
  Low: { text: "text-emerald-800", bg: "bg-emerald-500/10", ring: "ring-emerald-500/25" },
};

const NEWSLIST_PREVIEW = 3;

const SOURCE_BADGE = {
  news: {
    emoji: "📰",
    label: "News Article",
    cls: "bg-blue-500/10 text-blue-700 ring-blue-500/20",
  },
  community: {
    emoji: "👥",
    label: "Community Report",
    cls: "bg-amber-500/10 text-amber-800 ring-amber-500/20",
  },
  historical: {
    emoji: "📊",
    label: "Historical Data",
    cls: "bg-emerald-500/10 text-emerald-800 ring-emerald-500/20",
  },
} as const;

function SourceBadge({
  type,
  label,
}: {
  type: keyof typeof SOURCE_BADGE;
  label?: string;
}) {
  const s = SOURCE_BADGE[type];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide ring-1",
        s.cls,
      )}
    >
      <span aria-hidden>{s.emoji}</span>
      {label ?? s.label}
    </span>
  );
}

/**
 * Returns the URL only when it is a genuinely external http(s) link that can be
 * opened in a new tab. Anything else — relative paths, `seed://`/`/seed/…`
 * synthetic links, empty/malformed values — is treated as invalid and returns
 * null so we never render a "Read Article" button that navigates locally.
 */
/**
 * External news link button. Uses `!text-white` so Leaflet's default
 * `.leaflet-container a { color: #0078a8 }` rule can't turn the label blue on
 * its blue background when the card is rendered inside a map popup.
 */
function ReadStoryLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] leading-none font-semibold !text-white shadow-sm transition-colors hover:bg-blue-700"
    >
      Read Story
    </a>
  );
}

function NewsItem({ article }: { article: NewsArticleRef }) {
  const url = externalArticleUrl(article.url);
  return (
    <li className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-2.5 py-2 ring-1 ring-zinc-100">
      <div className="flex items-center justify-between gap-3">
        <SourceBadge type="news" />
        {url ? <ReadStoryLink url={url} /> : null}
      </div>
      <span className="line-clamp-2 text-zinc-800">{article.title}</span>
      <span className="text-[10.5px] font-medium text-zinc-400">
        {article.sourceDomain ? (
          <span className="font-semibold text-zinc-500">{article.sourceDomain} • </span>
        ) : null}
        {formatDateTime(article.publishedAt)}
      </span>
    </li>
  );
}

function externalArticleUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://safeher.local");
    // Reject any scheme that is not real web navigation, plus anything that
    // resolved to a local route (fell back to the base origin).
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.origin === "https://safeher.local") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function RiskBadge({ level, compact }: { level: RiskLevel; compact?: boolean }) {
  const styles =
    level === "High"
      ? "bg-rose-500/12 text-rose-700 ring-rose-500/20"
      : level === "Medium"
        ? "bg-amber-500/12 text-amber-800 ring-amber-500/20"
        : "bg-emerald-500/12 text-emerald-800 ring-emerald-500/20";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold ring-1",
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        styles,
      )}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: riskColor(level) }}
      />
      {level} risk
    </span>
  );
}

export function AreaHoverTooltip({ area }: { area: AreaRegion }) {
  const [showAllNews, setShowAllNews] = useState(false);
  const badge = RISK_BADGE[area.riskLevel];
  const allNews = area.newsArticles;
  const visibleNews = allNews.slice(0, NEWSLIST_PREVIEW);
  const hasMoreNews = allNews.length > NEWSLIST_PREVIEW;

  return (
    <div className="safeher-hover-card-inner flex max-h-[min(450px,calc(100dvh-16px))] w-[min(360px,88vw)] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white text-zinc-900 shadow-[0_18px_50px_rgba(24,24,27,0.18),0_0_0_1px_rgba(24,24,27,0.04)]">
      <div className="shrink-0 border-b border-zinc-100 px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[15px] leading-snug font-bold tracking-tight">
            {area.areaName}
          </h3>
        </div>
        <div className="mt-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1",
              badge.bg,
              badge.text,
              badge.ring,
            )}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: riskColor(area.riskLevel) }}
            />
            {area.riskLevel} Risk
          </span>
        </div>
      </div>

      <div className="safeher-hover-scroll min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-3.5">
        {area.reasons.length > 0 && (
          <section>
            <h4 className="mb-1.5 text-[10px] font-bold tracking-[0.14em] text-zinc-400 uppercase">
              Why
            </h4>
            <ul className="space-y-1 pl-4 text-[12.5px] leading-snug text-zinc-700">
              {area.reasons.slice(0, 3).map((r) => (
                <li key={r} className="list-disc">
                  {r}
                </li>
              ))}
            </ul>
          </section>
        )}

        {area.recentCategories.length > 0 && (
          <section>
            <h4 className="mb-1.5 text-[10px] font-bold tracking-[0.14em] text-zinc-400 uppercase">
              Recent Incidents
            </h4>
            <ul className="space-y-1 pl-4 text-[12.5px] leading-snug text-zinc-700">
              {area.recentCategories.slice(0, 3).map((cat) => (
                <li key={cat} className="list-disc">
                  {cat}
                </li>
              ))}
            </ul>
          </section>
        )}

        {allNews.length > 0 && (
          <section>
            <h4 className="mb-1.5 text-[10px] font-bold tracking-[0.14em] text-zinc-400 uppercase">
              Recent News
            </h4>
            <ul className="space-y-2.5 text-[12px] leading-snug">
              {visibleNews.map((article) => (
                <NewsItem key={article.title} article={article} />
              ))}
            </ul>

            {hasMoreNews && (
              <div className="mt-2">
                {showAllNews ? (
                  <div className="safeher-hover-news-scroll max-h-[150px] overflow-y-auto">
                    <ul className="space-y-2.5 text-[12px] leading-snug">
                      {allNews.slice(NEWSLIST_PREVIEW).map((article) => (
                        <NewsItem key={article.title} article={article} />
                      ))}
                    </ul>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowAllNews((s) => !s)}
                  className="mt-1 text-[11px] font-semibold text-zinc-500 transition-colors hover:text-zinc-900"
                >
                  {showAllNews
                    ? "Show less"
                    : `View all (${allNews.length})`}
                </button>
              </div>
            )}
          </section>
        )}

        {area.communityReports.length > 0 && (
          <section>
            <h4 className="mb-1.5 text-[10px] font-bold tracking-[0.14em] text-zinc-400 uppercase">
              Community Reports
            </h4>
            <ul className="space-y-2.5 text-[12px] leading-snug">
              {area.communityReports.slice(0, 3).map((r) => (
                <li
                  key={r.title}
                  className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-2.5 py-2 ring-1 ring-zinc-100"
                >
                  <SourceBadge type="community" />
                  <span className="line-clamp-2 text-zinc-800">{r.title}</span>
                  <span className="text-[10.5px] font-medium text-zinc-400">
                    {r.category ? (
                      <span className="font-semibold text-zinc-500">{r.category} • </span>
                    ) : null}
                    {formatDateTime(r.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {area.historicalDistrict && (
          <section>
            <h4 className="mb-1.5 text-[10px] font-bold tracking-[0.14em] text-zinc-400 uppercase">
              Historical Data
            </h4>
            <ul className="space-y-2.5 text-[12px] leading-snug">
              <li className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-2.5 py-2 ring-1 ring-zinc-100">
                <SourceBadge type="historical" />
                <span className="text-zinc-800">
                  {area.historicalDistrict}
                  {area.historicalSource ? (
                    <span className="font-medium text-zinc-400">
                      {" "}· {area.historicalSource}
                    </span>
                  ) : null}
                </span>
              </li>
            </ul>
          </section>
        )}

        {area.demoHistorical && area.demoHistorical.length > 0 && (
          <section>
            <h4 className="mb-1.5 text-[10px] font-bold tracking-[0.14em] text-zinc-400 uppercase">
              Demo Historical Data
            </h4>
            <ul className="space-y-1.5">
              {area.demoHistorical.map((d) => (
                <li
                  key={d.title}
                  className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-2.5 py-2 ring-1 ring-zinc-100"
                >
                  <SourceBadge type="historical" label="Demo" />
                  <span className="text-[12px] leading-snug text-zinc-800">{d.title}</span>
                  <span className="text-[10.5px] font-medium text-zinc-400">
                    {formatDateTime(d.date)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="!mt-4 border-t border-zinc-100 pt-2.5">
          <h4 className="text-[10px] font-bold tracking-[0.14em] text-zinc-400 uppercase">
            Latest Activity
          </h4>
          <p className="mt-0.5 text-[12px] font-medium text-zinc-600">
            {formatDateTime(area.lastUpdated)}
          </p>
        </section>
      </div>
    </div>
  );
}

export function RiskLegend({
  className,
  variant = "bar",
}: {
  className?: string;
  variant?: "bar" | "panel";
}) {
  const items: { level: RiskLevel; label: string }[] = [
    { level: "Low", label: "Low" },
    { level: "Medium", label: "Medium" },
    { level: "High", label: "High" },
  ];

  if (variant === "panel") {
    return (
      <div
        className={cn(
          "rounded-xl bg-white/90 px-3 py-2.5 shadow-lg shadow-black/8 ring-1 ring-black/5 backdrop-blur-md",
          className,
        )}
      >
        <div className="mb-1.5 text-[10px] font-semibold tracking-[0.12em] text-zinc-500 uppercase">
          Risk level
        </div>
        <div className="flex flex-col gap-1.5">
          {items.map(({ level, label }) => (
            <span key={level} className="inline-flex items-center gap-2 text-[11px] font-medium text-zinc-700">
              <span
                className="size-2.5 rounded-full shadow-sm ring-2 ring-white"
                style={{ backgroundColor: riskColor(level) }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {items.map(({ level, label }) => (
        <span key={level} className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full ring-2 ring-white shadow-sm"
            style={{ backgroundColor: riskColor(level) }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}

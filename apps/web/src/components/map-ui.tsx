"use client";

import { useState } from "react";

import { cn } from "@safe-her/ui/lib/utils";

import {
  type AreaRegion,
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
  const visibleNews = showAllNews ? allNews : allNews.slice(0, NEWSLIST_PREVIEW);
  const hasMoreNews = allNews.length > NEWSLIST_PREVIEW;

  return (
    <div className="safeher-hover-card-inner flex max-h-[min(450px,calc(100vh-16px))] w-[360px] max-w-full flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white text-zinc-900 shadow-[0_18px_50px_rgba(24,24,27,0.18),0_0_0_1px_rgba(24,24,27,0.04)]">
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
                <li
                  key={article.title}
                  className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-2.5 py-1.5 ring-1 ring-zinc-100"
                >
                  <span className="line-clamp-2 text-zinc-800">{article.title}</span>
                  <span className="text-[10.5px] font-medium text-zinc-400">
                    {formatDateTime(article.publishedAt)}
                  </span>
                </li>
              ))}
            </ul>

            {hasMoreNews && (
              <div className="mt-2">
                {showAllNews ? (
                  <div className="safeher-hover-news-scroll max-h-[150px] overflow-y-auto">
                    <ul className="space-y-2.5 text-[12px] leading-snug">
                      {allNews.slice(NEWSLIST_PREVIEW).map((article) => (
                        <li
                          key={article.title}
                          className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-2.5 py-1.5 ring-1 ring-zinc-100"
                        >
                          <span className="line-clamp-2 text-zinc-800">{article.title}</span>
                          <span className="text-[10.5px] font-medium text-zinc-400">
                            {formatDateTime(article.publishedAt)}
                          </span>
                        </li>
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

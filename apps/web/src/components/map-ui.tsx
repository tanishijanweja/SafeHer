"use client";

import { cn } from "@safe-her/ui/lib/utils";

import {
  type AreaRegion,
  type RiskLevel,
  relativeTime,
  riskColor,
} from "@/lib/heatmap-areas";

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
  return (
    <div className="min-w-[188px] max-w-[240px] font-sans text-zinc-900">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="text-[13px] leading-snug font-semibold tracking-tight">
          {area.areaName}
        </div>
      </div>
      <div className="mb-2.5">
        <RiskBadge level={area.riskLevel} compact />
      </div>

      {area.reasons.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
            Why
          </div>
          <ul className="space-y-0.5 pl-3.5 text-[12px] leading-snug text-zinc-700">
            {area.reasons.slice(0, 3).map((r) => (
              <li key={r} className="list-disc">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {area.recentCategories.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1">
          {area.recentCategories.slice(0, 3).map((cat) => (
            <span
              key={cat}
              className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600"
            >
              {cat}
            </span>
          ))}
        </div>
      )}

      <div className="border-t border-zinc-100 pt-2 text-[10.5px] text-zinc-400">
        Updated {relativeTime(area.lastUpdated)}
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

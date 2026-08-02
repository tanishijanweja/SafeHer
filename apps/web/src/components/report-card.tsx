"use client";

import { MapPin } from "lucide-react";
import Link from "next/link";

import { categoryLabel, REPORT_CATEGORIES, type Report } from "@/lib/types";
import { timeAgo } from "@/lib/geo";

import { CategoryChip, SeverityBadge, StatusPill } from "./ui-helpers";

export default function ReportCard({ report }: { report: Report }) {
  return (
    <Link
      href={`/reports/${report.id}`}
      className="group flex flex-col gap-2 rounded-xl border border-pink-400/15 bg-card/80 p-4 transition hover:border-pink-400/40 hover:bg-pink-500/5"
    >
      {report.image_url ? (
        <div className="-mx-4 -mt-4 mb-1 h-32 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={report.image_url}
            alt={report.title}
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-1 text-sm font-semibold text-foreground group-hover:text-muted-foreground">
          {report.title}
        </h3>
        <SeverityBadge severity={report.severity} />
      </div>

      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground/60">{report.description}</p>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <CategoryChip icon={categoryIcon(report.category)} label={categoryLabel(report.category)} />
        <StatusPill status={report.status} />
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground/40">
        <span className="flex items-center gap-1">
          <MapPin className="size-3" />
          {report.latitude.toFixed(4)}, {report.longitude.toFixed(4)}
        </span>
        <span>{timeAgo(report.created_at)}</span>
      </div>
    </Link>
  );
}

function categoryIcon(category: Report["category"]): string {
  return REPORT_CATEGORIES.find((c) => c.value === category)?.icon ?? "ellipsis";
}

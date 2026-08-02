"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@safe-her/ui/components/button";
import { Input } from "@safe-her/ui/components/input";

import ReportCard from "@/components/report-card";
import RequireAuth from "@/components/require-auth";
import { EmptyState, SectionHeading } from "@/components/ui-helpers";
import { useStoreVersion } from "@/lib/use-store";
import { REPORT_CATEGORIES, type ReportCategory } from "@/lib/types";
import { ensureSeeded, getReports } from "@/lib/store";
import { cn } from "@safe-her/ui/lib/utils";

export default function ReportsPage() {
  return (
    <RequireAuth>
      <ReportsList />
    </RequireAuth>
  );
}

function ReportsList() {
  useStoreVersion();
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ReportCategory | "all">("all");
  const [severity, setSeverity] = useState<number | "all">("all");
  const [onlyVerified, setOnlyVerified] = useState(false);

  useEffect(() => {
    ensureSeeded();
    setReady(true);
  }, []);

  const reports = useMemo(() => {
    if (!ready) return [];
    return getReports();
  }, [ready]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((r) => {
      if (r.is_spam) return false;
      if (category !== "all" && r.category !== category) return false;
      if (severity !== "all" && r.severity !== severity) return false;
      if (onlyVerified && r.status !== "community-corroborated") return false;
      if (
        q &&
        !r.title.toLowerCase().includes(q) &&
        !r.description.toLowerCase().includes(q) &&
        !r.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [reports, query, category, severity, onlyVerified]);

  if (!ready) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Community reports</h1>
          <p className="text-xs text-muted-foreground/50">
            {filtered.length} report{filtered.length === 1 ? "" : "s"} — spam is filtered out.
          </p>
        </div>
        <Link href="/reports/new">
          <Button className="h-9 rounded-full bg-pink-500 text-xs font-semibold text-white shadow-lg">
            <Plus className="size-4" /> New report
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-pink-400/15 bg-card/80 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/40" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, description or keyword…"
            className="rounded-full border-pink-400/20 bg-card/80 pl-9 text-foreground placeholder:text-muted-foreground/30"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
            All categories
          </FilterChip>
          {REPORT_CATEGORIES.map((c) => (
            <FilterChip key={c.value} active={category === c.value} onClick={() => setCategory(c.value)}>
              {c.label}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40">Severity</span>
          <FilterChip active={severity === "all"} onClick={() => setSeverity("all")}>
            Any
          </FilterChip>
          {[1, 2, 3, 4, 5].map((s) => (
            <FilterChip key={s} active={severity === s} onClick={() => setSeverity(s)}>
              {"●".repeat(s)}
            </FilterChip>
          ))}
          <div className="mx-2 h-4 w-px bg-pink-400/20" />
          <FilterChip active={onlyVerified} onClick={() => setOnlyVerified((v) => !v)}>
            ✓ Verified only
          </FilterChip>
        </div>
      </div>

      <SectionHeading title={`${filtered.length} matching reports`} />

      {filtered.length === 0 ? (
        <EmptyState title="No reports match" hint="Try a different filter or be the first to report it." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <ReportCard key={r.id} report={r} />
          ))}
        </div>
      )}
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

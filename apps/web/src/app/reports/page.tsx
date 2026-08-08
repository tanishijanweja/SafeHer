"use client";

import { useEffect, useState } from "react";

import { Megaphone, Newspaper } from "lucide-react";

import { cn } from "@safe-her/ui/lib/utils";

import ReportForm from "./report-form";
import ReportsFeed from "./reports-feed";

type View = "report" | "feed";

const VIEW_KEY = "safeher-reports-view";

export default function ReportsPage() {
  const [view, setView] = useState<View>("report");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "report" || saved === "feed") setView(saved);
    } catch {
      // ignore storage access errors (private mode)
    }
  }, []);

  function selectView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // ignore storage access errors (private mode)
    }
  }

  return (
    <div className="min-h-0">
      <div className="mx-auto flex max-w-xl justify-center px-4 pt-6">
        <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1" role="tablist">
          <ToggleButton
            active={view === "report"}
            onClick={() => selectView("report")}
            icon={<Megaphone className="size-3.5" />}
            label="Report Incident"
          />
          <ToggleButton
            active={view === "feed"}
            onClick={() => selectView("feed")}
            icon={<Newspaper className="size-3.5" />}
            label="Reports & News"
          />
        </div>
      </div>

      {view === "report" ? <ReportForm /> : <ReportsFeed />}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all",
        active
          ? "bg-background text-foreground shadow-sm ring-1 ring-border/80"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

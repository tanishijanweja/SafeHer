"use client";

import {
  AlertTriangle,
  Bus,
  Ellipsis,
  EyeOff,
  Heart,
  LightbulbOff,
  MapPinOff,
  Megaphone,
  ShieldAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { categoryLabel, SEVERITY_LABELS } from "@/lib/types";

import { cn } from "@safe-her/ui/lib/utils";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  megaphone: Megaphone,
  wallet: Wallet,
  "shield-alert": ShieldAlert,
  "lightbulb-off": LightbulbOff,
  "map-pin-x": MapPinOff,
  bus: Bus,
  "eye-off": EyeOff,
  "alert-triangle": AlertTriangle,
  ellipsis: Ellipsis,
};

export function CategoryChip({ icon, label }: { icon: string; label: string }) {
  const Icon = CATEGORY_ICONS[icon] ?? Ellipsis;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-pink-400/25 bg-pink-500/10 px-2.5 py-0.5 text-[11px] text-foreground">
      <Icon className="size-3.5 text-primary" />
      {label}
    </span>
  );
}

export function SeverityBadge({ severity, size = "sm" }: { severity: number; size?: "sm" | "lg" }) {
  const color = severity >= 4 ? "text-rose-300 border-rose-400/40 bg-rose-500/15" : severity === 3 ? "text-muted-foreground border-pink-400/40 bg-pink-500/15" : "text-foreground/70 border-pink-400/20 bg-pink-500/5";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-mono",
        size === "lg" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[10px]",
        color,
      )}
      title={SEVERITY_LABELS[severity]}
    >
      <span className="tracking-tight">
        {"●".repeat(severity)}
        <span className="opacity-20">{"●".repeat(5 - severity)}</span>
      </span>
      <span className="ml-0.5">{SEVERITY_LABELS[severity]}</span>
    </span>
  );
}

export function StatusPill({ status }: { status: "unverified" | "community-corroborated" }) {
  const corroborated = status === "community-corroborated";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        corroborated
          ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-200"
          : "border-amber-400/40 bg-amber-500/10 text-amber-200",
      )}
    >
      <span className={cn("size-1.5 rounded-full", corroborated ? "bg-emerald-400" : "bg-amber-400 animate-pulse")} />
      {corroborated ? "Community verified" : "Unverified"}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = "pink",
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "pink" | "rose" | "emerald" | "sky";
}) {
  const accents: Record<string, string> = {
    pink: "text-primary",
    rose: "text-rose-300",
    emerald: "text-emerald-600 dark:text-emerald-300",
    sky: "text-sky-300",
  };
  return (
    <div className="rounded-lg border border-pink-400/15 bg-card/80 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60">{label}</div>
      <div className={cn("mt-1 font-mono text-2xl font-semibold", accents[accent])}>{value}</div>
      {hint ? <div className="mt-0.5 text-[10px] text-muted-foreground/40">{hint}</div> : null}
    </div>
  );
}

export function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-foreground">{title}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-pink-400/20 bg-card/70 px-6 py-10 text-center">
      <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-pink-500/10">
        <Heart className="size-5 text-primary" />
      </div>
      <p className="text-sm text-foreground">{title}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground/50">{hint}</p> : null}
    </div>
  );
}

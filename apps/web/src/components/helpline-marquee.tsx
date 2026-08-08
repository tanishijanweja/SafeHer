"use client";

import { Phone, Siren, ShieldAlert } from "lucide-react";

import { cn } from "@safe-her/ui/lib/utils";

const HELPLINES = [
  { number: "112", label: "Emergency" },
  { number: "100", label: "Police" },
  { number: "101", label: "Fire" },
  { number: "102", label: "Ambulance" },
  { number: "1091", label: "Women Helpline" },
  { number: "1098", label: "Child Helpline" },
  { number: "181", label: "Women Helpline (Abuse)" },
] as const;

export default function HelplineMarquee() {
  return (
    <div className="sticky top-0 z-40 flex items-center overflow-hidden border-b border-safeher-rose/20 bg-safeher-rose/95 text-white shadow-sm shadow-rose-900/10 backdrop-blur-sm dark:bg-safeher-rose/90">
      <div className="mx-1.5 my-1 flex shrink-0 items-center gap-2 rounded-2xl bg-rose-950/90 px-3 py-2 shadow-sm sm:px-4">
        <Siren className="size-4 animate-pulse" aria-hidden />
        <span className="text-[11px] font-bold tracking-wider whitespace-nowrap uppercase">
          Helplines
        </span>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex min-w-full shrink-0 animate-marquee items-center gap-8 py-2.5 will-change-transform motion-reduce:animate-none">
          {[...HELPLINES, ...HELPLINES, ...HELPLINES].map((h, i) => (
            <a
              key={`${h.number}-${i}`}
              href={`tel:${h.number}`}
              className={cn(
                "group inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition hover:bg-white/10",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
              )}
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
                <Phone className="size-2.5" aria-hidden />
              </span>
              <span className="opacity-90 group-hover:opacity-100">{h.label}</span>
              <span className="text-sm font-bold tabular-nums">{h.number}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="mx-1.5 my-1 hidden shrink-0 items-center gap-1.5 rounded-2xl bg-rose-950/90 px-3 py-2 text-[11px] font-semibold shadow-sm sm:flex sm:px-4">
        <ShieldAlert className="size-3.5" aria-hidden />
        Tap to call
      </div>
    </div>
  );
}

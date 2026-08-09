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
    <div className="sticky top-0 z-40 flex items-center gap-2 overflow-hidden bg-gradient-to-r from-rose-700 via-red-600 to-rose-700 px-4 py-1 text-white shadow-lg shadow-red-900/20 ring-1 ring-white/10">
      <div className="flex shrink-0 items-center gap-2 rounded-full bg-white/15 px-3 py-1 shadow-sm ring-1 ring-white/25 backdrop-blur-sm">
        <Siren className="size-3.5 animate-pulse" aria-hidden />
        <span className="text-xs font-bold tracking-[0.16em] whitespace-nowrap uppercase">
          Helplines
        </span>
      </div>

      <div className="relative flex flex-1 min-w-0 overflow-hidden">
        <div className="flex min-w-full shrink-0 animate-marquee items-center gap-2 py-1 will-change-transform motion-reduce:animate-none">
          {[...HELPLINES, ...HELPLINES, ...HELPLINES].map((h, i) => (
            <a
              key={`${h.number}-${i}`}
              href={`tel:${h.number}`}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold text-white/95 transition hover:bg-white/15",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/20">
                <Phone className="size-2.5" aria-hidden />
              </span>
              <span className="opacity-95">{h.label}</span>
              <span className="text-[15px] font-bold tabular-nums tracking-tight">{h.number}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-red-600 shadow-sm ring-1 ring-black/5 sm:flex">
        <ShieldAlert className="size-3.5" aria-hidden />
        Tap to call
      </div>
    </div>
  );
}

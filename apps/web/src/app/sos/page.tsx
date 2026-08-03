"use client";

import Link from "next/link";
import { HeartPulse, MapPin, Phone } from "lucide-react";

export default function SosPage() {
  return (
    <main className="relative min-h-0 overflow-y-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,oklch(0.92_0.05_20),transparent_55%)]"
      />
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-4 py-16 text-center sm:px-6">
        <span className="flex size-16 items-center justify-center rounded-full bg-safeher-rose/15 text-safeher-rose ring-1 ring-safeher-rose/20">
          <HeartPulse className="size-7" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Panic SOS</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {/* TODO: wire to SOSEvent API + trusted contacts notification */}
            One tap will share your live location and battery with trusted contacts and
            surface nearby police stations and hospitals.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-safeher-rose text-base font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:brightness-110 active:scale-[0.98]"
          onClick={() => {
            // TODO: POST /sos with geolocation + notify contacts
            alert("SOS triggered (demo). Backend integration pending.");
          }}
        >
          <HeartPulse className="size-5" />
          Hold to send SOS
        </button>
        <div className="grid w-full max-w-xs gap-2 text-left text-sm">
          <div className="flex items-center gap-3 rounded-xl bg-card/80 px-4 py-3 ring-1 ring-border/60">
            <MapPin className="size-4 text-primary" />
            Share live location
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-card/80 px-4 py-3 ring-1 ring-border/60">
            <Phone className="size-4 text-primary" />
            Notify trusted contacts
          </div>
        </div>
        <Link href="/contacts" className="text-sm font-medium text-primary hover:underline">
          Manage trusted contacts →
        </Link>
      </div>
    </main>
  );
}

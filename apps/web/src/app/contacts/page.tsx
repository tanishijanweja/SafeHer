"use client";

import { Users } from "lucide-react";

export default function ContactsPage() {
  return (
    <main className="relative min-h-0 overflow-y-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,oklch(0.93_0.04_350),transparent_55%)]"
      />
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-4 py-16 text-center sm:px-6">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
          <Users className="size-7" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Trusted contacts</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {/* TODO: list/create TrustedContact via API once contacts routes exist */}
            People who receive your SOS alerts and live trip updates. Backend routes for
            contacts are not exposed yet — UI will connect when available.
          </p>
        </div>
        <div className="w-full rounded-2xl bg-card/80 px-5 py-8 text-sm text-muted-foreground ring-1 ring-border/60">
          No contacts yet. Add family or friends you trust in an emergency.
        </div>
        <button
          type="button"
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition hover:bg-primary/90"
          onClick={() => {
            // TODO: open add-contact dialog + POST /contacts
            alert("Add contact (demo). Backend integration pending.");
          }}
        >
          Add contact
        </button>
      </div>
    </main>
  );
}

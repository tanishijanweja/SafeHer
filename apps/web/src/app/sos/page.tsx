"use client";

import {
  Ambulance,
  CheckCircle2,
  HeartPulse,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  Shield,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@safe-her/ui/components/button";

import RequireAuth from "@/components/require-auth";
import { SafeMap, type SafeMarker } from "@/components/safe-map";
import { EmptyState, SectionHeading, StatCard } from "@/components/ui-helpers";
import { useStoreVersion } from "@/lib/use-store";
import { formatDateTime, riskColor } from "@/lib/geo";
import {
  ensureSeeded,
  getAlerts,
  getContacts,
  getSosEvents,
  nearbyByType,
  resolveSos,
  triggerSos,
  type TriggerSosResult,
} from "@/lib/store";
import { type GeoPoint, type SosEvent } from "@/lib/types";
import { cn } from "@safe-her/ui/lib/utils";

type Phase = "idle" | "arming" | "active" | "just-resolved";

export default function SosPage() {
  return (
    <RequireAuth>
      <SosBody />
    </RequireAuth>
  );
}

function SosBody() {
  useStoreVersion();
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(3);
  const [locating, setLocating] = useState(false);
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [result, setResult] = useState<TriggerSosResult | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPlace, setManualPlace] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    ensureSeeded();
    setReady(true);
  }, []);

  const contacts = useMemo(() => (ready ? getContacts() : []), [ready]);
  const events = useMemo(() => (ready ? getSosEvents() : []), [ready]);
  const alerts = useMemo(() => (ready ? getAlerts() : []), [ready]);
  const activeEvents = useMemo(() => events.filter((e) => e.status === "active"), [events]);

  const nearbyPolice = useMemo(
    () => (location ? nearbyByType(location, "police", 5) : []),
    [location],
  );
  const nearbyHospitals = useMemo(
    () => (location ? nearbyByType(location, "hospital", 5) : []),
    [location],
  );

  // Arming countdown
  useEffect(() => {
    if (phase !== "arming") return;
    if (count <= 0) {
      fireSos();
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count]); // eslint-disable-line react-hooks/exhaustive-deps

  function captureLocation(): Promise<GeoPoint> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: 28.6139, lng: 77.209 });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: 28.6139, lng: 77.209 }),
        { timeout: 8000, enableHighAccuracy: true },
      );
    });
  }

  function fireSos() {
    void (async () => {
      let point = location;
      if (!point) {
        setLocating(true);
        point = await captureLocation();
        setLocating(false);
      }
      setLocation(point);
      const res = triggerSos(point);
      setResult(res);
      setPhase("active");
      toast.error(`SOS activated — ${res.alerts.length} trusted contacts notified`, {
        duration: 6000,
      });
    })();
  }

  async function locateMe() {
    setLocating(true);
    const point = await captureLocation();
    setLocating(false);
    setLocation(point);
    setManualOpen(false);
    toast(`Location set — ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`);
  }

  async function geocodePlace(query: string): Promise<GeoPoint | null> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(query)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const hit = Array.isArray(data) ? data[0] : null;
      if (!hit) return null;
      return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
    } catch {
      return null;
    }
  }

  async function applyManualLocation() {
    const q = manualPlace.trim();
    if (!q) {
      setManualError("Enter a place name.");
      return;
    }
    setGeocoding(true);
    setManualError(null);
    const point = await geocodePlace(q);
    setGeocoding(false);
    if (!point) {
      setManualError(`Could not find "${q}". Try a more specific name, e.g. Connaught Place, New Delhi.`);
      return;
    }
    setLocation(point);
    setManualOpen(false);
    setManualPlace("");
    toast(`Location set — ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`);
  }

  function clearLocation() {
    setLocation(null);
  }

  const startSos = () => {
    if (contacts.length === 0) {
      toast.error("Add at least one trusted contact first");
      return;
    }
    setCount(3);
    setPhase("arming");
  };

  const cancelSos = () => {
    setPhase("idle");
    toast("SOS cancelled");
  };

  const markSafe = (id: string) => {
    resolveSos(id);
    setPhase("just-resolved");
    setResult(null);
    toast.success("You're safe — SOS resolved and contacts notified");
  };

  const safeMarkers: SafeMarker[] = useMemo(() => {
    if (!location) return [];
    const police = nearbyPolice.map((p) => ({
      id: p.id,
      lat: p.latitude,
      lng: p.longitude,
      kind: "police" as const,
      label: "P",
    }));
    const hospitals = nearbyHospitals.map((h) => ({
      id: h.id,
      lat: h.latitude,
      lng: h.longitude,
      kind: "hospital" as const,
      label: "H",
    }));
    const sosMarker: SafeMarker[] =
      phase !== "idle" && location
        ? [{ id: "live-sos", lat: location.lat, lng: location.lng, kind: "sos" as const }]
        : [];
    return [...police, ...hospitals, ...sosMarker];
  }, [location, nearbyPolice, nearbyHospitals, phase]);

  if (!ready) return null;

  const activeAlert = activeEvents[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Trusted contacts" value={contacts.length} hint="will be alerted on SOS" accent="pink" />
        <StatCard label="Police nearby" value={nearbyPolice.length} hint="nearest to your location" accent="sky" />
        <StatCard label="Hospitals nearby" value={nearbyHospitals.length} hint="nearest to your location" accent="rose" />
      </div>

      {/* Location picker */}
      <div className="mb-5 rounded-2xl border border-pink-400/15 bg-card/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <MapPin className="size-4 text-primary" /> Your location
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/50">
            {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : "Not set"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            onClick={locateMe}
            disabled={locating}
            className="h-8 rounded-full bg-pink-500 px-4 text-xs font-semibold text-white"
          >
            {locating ? <Loader2 className="size-3.5 animate-spin" /> : <MapPin className="size-3.5" />} Use my location
          </Button>
          <Button
            onClick={() => setManualOpen((v) => !v)}
            variant="outline"
            className="h-8 rounded-full border-pink-400/30 px-4 text-xs font-semibold text-foreground"
          >
            Enter manually
          </Button>
          {location ? (
            <Button
              onClick={clearLocation}
              variant="ghost"
              className="h-8 rounded-full px-3 text-xs font-semibold text-muted-foreground"
            >
              Clear
            </Button>
          ) : null}
        </div>
        {manualOpen ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-[10px] text-muted-foreground">
              Place
              <input
                value={manualPlace}
                onChange={(e) => setManualPlace(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void applyManualLocation();
                  }
                }}
                placeholder="e.g. Connaught Place, New Delhi"
                className="h-8 w-full rounded-lg border border-pink-400/20 bg-background px-2 text-xs text-foreground outline-none focus:border-pink-400"
              />
            </label>
            <Button
              onClick={applyManualLocation}
              disabled={geocoding}
              className="h-8 rounded-full bg-pink-500 px-4 text-xs font-semibold text-white"
            >
              {geocoding ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />} Locate
            </Button>
            {manualError ? <p className="w-full text-[11px] text-red-500">{manualError}</p> : null}
          </div>
        ) : null}
        <p className="mt-2 text-[10px] text-muted-foreground/40">
          Set a location to see nearby police &amp; hospitals without an SOS — no location permission needed. You can also tap the map to pin a spot.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        {/* Panic panel */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-pink-400/15 bg-card/80 p-8">
          <div className="relative mb-6 flex flex-col items-center">
            <div
              className={cn(
                "absolute -inset-8 rounded-full bg-red-500/20 blur-2xl",
                phase === "arming" && "animate-pulse-slow",
              )}
            />
            <button
              type="button"
              onClick={startSos}
              disabled={phase === "arming" || phase === "active"}
              className={cn(
                "relative flex size-40 items-center justify-center rounded-full border-4 text-4xl font-bold text-white shadow-2xl transition active:scale-95",
                phase === "active"
                  ? "border-red-300 bg-red-600"
                  : phase === "arming"
                    ? "animate-pulse-slow border-red-300 bg-red-600"
                    : "border-red-400/60 bg-red-600 hover:scale-[1.03] hover:bg-red-500",
              )}
            >
              {phase === "arming" ? (
                <span className="font-mono text-6xl">{count}</span>
              ) : phase === "active" ? (
                <HeartPulse className="size-14 animate-pulse-slow" />
              ) : (
                <>
                  <HeartPulse className="mb-1 size-12" />
                  <span className="absolute bottom-6 text-xs font-medium tracking-widest">SOS</span>
                </>
              )}
            </button>
            <p className="mt-6 text-center text-xs text-muted-foreground/60">
              {phase === "idle"
                ? "Tap to arm a 3-second countdown, then your live location goes to your trusted contacts."
                : phase === "arming"
                  ? "Hold on — press cancel to stop"
                  : phase === "active"
                    ? "Your location and a help request have been sent."
                    : "You’re all set."}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {phase === "arming" ? (
              <Button
                onClick={cancelSos}
                variant="outline"
                className="rounded-full border-rose-400/40 bg-rose-500/10 text-destructive"
              >
                Cancel
              </Button>
            ) : phase === "active" && activeAlert ? (
              <Button
                onClick={() => markSafe(activeAlert.id)}
                className="rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-200 ring-1 ring-emerald-400/40"
              >
                <CheckCircle2 className="size-4" /> I&apos;m safe now
              </Button>
            ) : phase === "just-resolved" ? (
              <Button onClick={() => setPhase("idle")} variant="outline" className="rounded-full border-pink-400/30 text-foreground">
                Done
              </Button>
            ) : (
              <Link href="/contacts">
                <Button variant="outline" className="rounded-full border-pink-400/30 text-foreground">
                  <UsersRound className="size-4" /> Manage contacts
                </Button>
              </Link>
            )}
          </div>

          {locating ? (
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground/60">
              <Loader2 className="size-4 animate-spin" /> Capturing your location…
            </p>
          ) : null}

          {contacts.length === 0 ? (
            <p className="mt-4 text-center text-[11px] text-amber-300/80">
              You have no trusted contacts yet —{" "}
              <Link href="/contacts" className="underline">
                add one
              </Link>{" "}
              before triggering an SOS.
            </p>
          ) : null}
        </div>

        {/* Live help panel */}
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-2xl border border-pink-400/15 bg-card/80">
            <div className="flex items-center justify-between border-b border-pink-400/15 bg-card/80 px-3 py-2 text-xs font-medium text-foreground">
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4 text-primary" /> Nearest help
              </span>
              {location ? (
                <span className="font-mono text-[10px] text-muted-foreground/50">
                  {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                </span>
              ) : null}
            </div>
            <div className="h-72">
              {location ? (
                <SafeMap
                  markers={safeMarkers}
                  center={location}
                  initialZoom={14}
                  heat={[{ lat: location.lat, lng: location.lng, score: 5 }]}
                  selectable={phase === "idle"}
                  onSelectPoint={(p) => setLocation(p)}
                  selectedPoint={phase === "idle" ? location : null}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground/40">
                  Set your location to see nearby police & hospitals
                </div>
              )}
            </div>
            <div className="border-t border-pink-400/15 bg-card/80 px-3 py-2 text-[10px] text-muted-foreground/40">
              Blue dots = police stations · red dots = hospitals · marker = your location
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <NearbyList title="Police stations" type="police" items={nearbyPolice} accent="#38bdf8" />
            <NearbyList title="Hospitals" type="hospital" items={nearbyHospitals} accent="#ff4d6d" />
          </div>
        </div>
      </div>

      {/* SOS history */}
      <div className="mt-8">
        <SectionHeading
          title="SOS history"
          action={
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
              <Mail className="size-3" /> {alerts.length} alerts delivered
            </span>
          }
        />
        {events.length === 0 ? (
          <EmptyState title="No SOS events yet" hint="Your panic alarms will appear here." />
        ) : (
          <div className="flex flex-col gap-2">
            {events.map((e) => (
              <SosHistoryRow key={e.id} event={e} onResolve={markSafe} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SosHistoryRow({ event, onResolve }: { event: SosEvent; onResolve: (id: string) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pink-400/15 bg-card/80 px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full",
            event.status === "active"
              ? "animate-pulse-slow bg-rose-500/20 text-destructive"
              : "bg-pink-500/10 text-primary",
          )}
        >
          <HeartPulse className="size-4" />
        </span>
        <div>
          <p className="text-xs font-semibold text-foreground">
            {event.status === "active" ? "SOS active" : "SOS resolved"}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground/50">
            {event.latitude.toFixed(5)}, {event.longitude.toFixed(5)} · {formatDateTime(event.created_at)}
          </p>
        </div>
      </div>
      {event.status === "active" ? (
        <Button
          onClick={() => onResolve(event.id)}
          className="rounded-full bg-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30"
        >
          <CheckCircle2 className="size-4" /> Mark safe
        </Button>
      ) : (
        <span className="text-[11px] text-emerald-600/70 dark:text-emerald-300/70">Resolved {event.resolved_at ? formatDateTime(event.resolved_at) : ""}</span>
      )}
    </div>
  );
}

function NearbyList({
  title,
  items,
  accent,
  type,
}: {
  title: string;
  type: "police" | "hospital";
  items: ReturnType<typeof nearbyByType>;
  accent: string;
}) {
  const Icon = type === "police" ? Shield : Ambulance;
  return (
    <div className="rounded-2xl border border-pink-400/15 bg-card/80 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Icon className="size-4" style={{ color: accent }} /> {title}
      </div>
      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/40">Set your location to see nearby {type}s.</p>
        ) : (
          items.map((p) => (
            <div key={p.id} className="rounded-lg border border-pink-400/10 bg-card/70 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-foreground">{p.name}</span>
                <span className="shrink-0 font-mono text-[10px]" style={{ color: riskColor(Math.max(1, Math.min(5, 5 - p.distanceKm))) }}>
                  {p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)}m` : `${p.distanceKm.toFixed(1)}km`}
                </span>
              </div>
              <a href={`tel:${p.phone.replace(/\s+/g, "")}`} className="mt-1 flex items-center gap-1 text-[10px] text-primary hover:underline">
                <Phone className="size-3" /> {p.phone}
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

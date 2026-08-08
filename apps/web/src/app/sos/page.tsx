"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  HeartPulse,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Square,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  fetchContacts,
  triggerSos,
  type SosTriggerResult,
  type TrustedContact,
} from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import {
  fetchNearbyServices,
  haversineKm,
  type EmergencyService,
  type EmergencyType,
} from "@/lib/emergency";
import {
  deleteRecording,
  recordingUrl,
  saveRecordingBlob,
  type SavedRecording,
} from "@/lib/recorder-db";

import { NearbyHelp } from "@/components/nearby-help";

const SafetyMap = dynamic(() => import("@/components/safety-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 items-center justify-center bg-zinc-100 text-xs text-muted-foreground">
      Loading map…
    </div>
  ),
});

const DEFAULT_LOCATION = { lat: 28.6139, lng: 77.209 };
const COUNTDOWN_SECONDS = 5;
/** How often to check the live location while SOS is active (ms). */
const LOCATION_CHECK_MS = 8000;
/** Distance that counts as "moved significantly" — notify contacts again. */
const MOVE_THRESHOLD_KM = 0.3;

const EMERGENCY_MESSAGE =
  "I need help right now. Please contact the emergency services or someone near my location immediately.";

type SosPhase =
  | "idle"
  | "mic"
  | "countdown"
  | "sending"
  | "live"
  | "error"
  | "ended";

/** Recording is kept only on this device — never sent to the server. */
type RecStatus = "none" | "recording" | "saved";

/** Map styling per emergency service type. */
const SERVICE_META: Record<
  EmergencyType,
  { glyph: "police" | "hospital" | "fire" | "helpline"; color: string; label: string }
> = {
  police: { glyph: "police", color: "#2563eb", label: "Police" },
  hospital: { glyph: "hospital", color: "#16a34a", label: "Hospital" },
  fire: { glyph: "fire", color: "#dc2626", label: "Fire" },
  helpline: { glyph: "helpline", color: "#7c3aed", label: "Helpline" },
};

function mapsUrlFor(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}&z=16`;
}

function defaultRecordingName(): string {
  return `sos-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

export default function SosPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [phase, setPhase] = useState<SosPhase>("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [sent, setSent] = useState<SosTriggerResult | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const [position, setPosition] = useState(DEFAULT_LOCATION);
  const [geoDenied, setGeoDenied] = useState(false);

  const [services, setServices] = useState<EmergencyService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState(false);

  const [recStatus, setRecStatus] = useState<RecStatus>("none");
  const [recordingMeta, setRecordingMeta] = useState<SavedRecording | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Refs so the live-updater can always read the latest location / send point.
  const positionRef = useRef(position);
  const lastSentRef = useRef(position);

  // Always track the live location so the map + nearby help stay current.
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoDenied(true);
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => setGeoDenied(true),
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 12000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Fetch nearby services for the map + sidebar whenever the location changes.
  useEffect(() => {
    let cancelled = false;
    setServicesLoading(true);
    setServicesError(false);
    const timer = window.setTimeout(() => {
      fetchNearbyServices(position.lat, position.lng)
        .then((data) => {
          if (!cancelled) setServices(data);
        })
        .catch(() => {
          if (!cancelled) setServicesError(true);
        })
        .finally(() => {
          if (!cancelled) setServicesLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [position.lat, position.lng]);

  // While SOS is live, re-check location often; if the user moved significantly,
  // notify contacts with the new live location. Failures never crash the page.
  useEffect(() => {
    if (phase !== "live") return;
    const sendUpdate = async () => {
      const current = positionRef.current;
      const last = lastSentRef.current;
      const moved = haversineKm(
        last.lat,
        last.lng,
        current.lat,
        current.lng,
      );
      if (!moved || moved < MOVE_THRESHOLD_KM) return;
      lastSentRef.current = current;
      try {
        await triggerSos({
          latitude: current.lat,
          longitude: current.lng,
          location: mapsUrlFor(current.lat, current.lng),
          emergencyMessage: EMERGENCY_MESSAGE,
        });
        toast.success("Location updated with your contacts");
      } catch {
        // A failed update shouldn't end the SOS session.
        toast.error("Couldn't share your updated location. Keep moving — we'll retry.");
      }
    };
    const id = window.setInterval(() => void sendUpdate(), LOCATION_CHECK_MS);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (isPending || !session) return;
    let cancelled = false;
    setContactsLoading(true);
    fetchContacts()
      .then((data) => {
        if (!cancelled) setContacts(data);
      })
      .catch(() => {
        if (!cancelled) setContacts([]);
      })
      .finally(() => {
        if (!cancelled) setContactsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, session]);

  const getBatteryLevel = useCallback(async (): Promise<number | undefined> => {
    try {
      const nav = navigator as Navigator & {
        getBattery?: () => Promise<{ level: number }>;
      };
      if (!nav.getBattery) return undefined;
      const battery = await nav.getBattery();
      return Math.round(battery.level * 100);
    } catch {
      return undefined;
    }
  }, []);

  /** Ask for the microphone and begin a continuous recording. Returns granted. */
  const startMicRecording = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      return true;
    } catch {
      return false;
    }
  }, []);

  /** Stop the mic and return the captured Blob (local only). */
  const stopMicRecording = useCallback(async (): Promise<{ blob: Blob } | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return null;
    const finished = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    try {
      recorder.stop();
    } catch {
      /* ignore */
    }
    streamRef.current?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    });
    await finished;
    recorderRef.current = null;
    streamRef.current = null;
    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
    return blob.size > 0 ? { blob } : null;
  }, []);

  const persistRecording = useCallback(async (blob: Blob) => {
    const meta = await saveRecordingBlob(blob, defaultRecordingName());
    setRecordingMeta(meta);
    setDownloadUrl(await recordingUrl(meta.id));
    setRecStatus("saved");
  }, []);

  // Countdown → fire SOS automatically at zero.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      void runSos();
      return;
    }
    const timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdown]);

  // Live elapsed timer while SOS is active.
  useEffect(() => {
    if (phase !== "live") return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const cancelCountdown = useCallback(() => {
    setPhase("idle");
    setCountdown(COUNTDOWN_SECONDS);
    toast.info("SOS cancelled.");
  }, []);

  // Press the button → mic first, then the countdown.
  async function handleArmSos() {
    if (phase !== "idle") return;
    setError(null);
    setSent(null);
    setMicDenied(false);
    setRecStatus("none");
    setConfirmEnd(false);
    setPhase("mic");
    const granted = await startMicRecording();
    setMicDenied(!granted);
    setRecStatus(granted ? "recording" : "none");
    setPhase("countdown");
    setCountdown(COUNTDOWN_SECONDS);
  }

  async function runSos() {
    setPhase("sending");
    setError(null);
    const batteryLevel = await getBatteryLevel();
    try {
      const result = await triggerSos({
        latitude: position.lat,
        longitude: position.lng,
        batteryLevel,
        location: mapsUrlFor(position.lat, position.lng),
        emergencyMessage: EMERGENCY_MESSAGE,
      });
      lastSentRef.current = position;
      setSent(result);
      setPhase("live");
      const delivered = countDelivered(result);
      if (delivered > 0) {
        toast.success(
          `SOS sent to ${delivered} contact${delivered === 1 ? "" : "s"}`,
        );
      } else {
        toast.warning(
          "SOS recorded, but we couldn't reach any contacts yet. We'll keep trying.",
        );
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setPhase("idle");
        router.push("/login?redirect=/sos");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Couldn't send SOS. Try again.");
      setPhase("error");
    }
  }

  /** Stop/keep audio or (if already off) turn it back on — user's choice. */
  async function toggleRecording() {
    if (recStatus === "recording") {
      const rec = await stopMicRecording();
      if (rec) {
        try {
          await persistRecording(rec.blob);
        } catch {
          toast.error("Couldn't save the recording.");
        }
      } else {
        setRecStatus("none");
      }
    } else {
      const granted = await startMicRecording();
      setMicDenied(!granted);
      setRecStatus(granted ? "recording" : recStatus);
    }
  }

  async function handleEndSos() {
    if (recStatus === "recording") {
      const rec = await stopMicRecording();
      if (rec) {
        try {
          await persistRecording(rec.blob);
        } catch {
          /* ignore */
        }
      }
    }
    setPhase("ended");
  }

  async function handleDeleteRecording() {
    if (!recordingMeta) return;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    await deleteRecording(recordingMeta.id);
    setRecordingMeta(null);
    setDownloadUrl(null);
    setRecStatus("none");
  }

  function handleReset() {
    setPhase("idle");
    setCountdown(COUNTDOWN_SECONDS);
    setError(null);
    setSent(null);
    setMicDenied(false);
    setRecStatus("none");
    setConfirmEnd(false);
  }

  const noContacts = !contactsLoading && contacts.length === 0;

  // Markers for the live map: your position + each nearby service. Always
  // include at least 2 of each of police / hospital / fire, then fill with the
  // nearest remaining services.
  const mapPoints = useMemo(() => {
    const live = { id: "live", lat: position.lat, lng: position.lng, color: "#e11d48", live: true as const };
    const located = services.filter((s) => s.lat !== undefined && s.lng !== undefined);
    const selected: EmergencyService[] = [];
    const taken = new Set<string>();
    const MIN_PER_CATEGORY = 2;
    const MAX_POINTS = 20;
    for (const type of ["police", "hospital", "fire"] as const) {
      let picked = 0;
      for (const s of located) {
        if (picked >= MIN_PER_CATEGORY) break;
        if (selected.length >= MAX_POINTS) break;
        if (s.type !== type || taken.has(s.id)) continue;
        selected.push(s);
        taken.add(s.id);
        picked += 1;
      }
    }
    for (const s of located) {
      if (selected.length >= MAX_POINTS) break;
      if (taken.has(s.id)) continue;
      selected.push(s);
      taken.add(s.id);
    }
    const pois = selected.map((s) => ({
      id: s.id,
      lat: s.lat!,
      lng: s.lng!,
      color: SERVICE_META[s.type].color,
      glyph: SERVICE_META[s.type].glyph,
      popup: (
        <div className="space-y-1 text-left">
          <p className="text-[13px] font-semibold">
            {s.name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {s.phone ?? s.address ?? "No public number"} · {s.distanceLabel}
          </p>
          {s.phone && (
            <a
              href={`tel:${s.phone}`}
              className="inline-flex items-center rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white"
            >
              Call now
            </a>
          )}
        </div>
      ),
    }));
    return [live, ...pois];
  }, [position, services]);

  // Per-contact delivery status while SOS is live.
  const deliveries = useMemo<
    Array<{ name: string; phone: string; delivered: boolean }>
  >(() => {
    if (!sent) return [];
    const map = new Map<string, { name: string; phone: string; delivered: boolean }>();
    for (const c of sent.notifiedContacts) {
      const cur = map.get(c.contactId) ?? { name: c.name, phone: c.phone, delivered: false };
      cur.delivered = cur.delivered || c.delivered;
      map.set(c.contactId, cur);
    }
    return Array.from(map.values());
  }, [sent]);

  return (
    <main className="min-h-0">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* LEFT — controls + live map */}
          <section className="flex flex-col gap-4">
            <div className="mb-1">
              <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
                <span className="flex size-9 items-center justify-center rounded-full bg-red-600/10 text-red-600 ring-1 ring-red-600/15">
                  <HeartPulse className="size-5" />
                </span>
                Panic SOS
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Mic first, then 5 seconds to cancel. Nearby help and a local-only recording follow.
              </p>
            </div>

            {/* Action area */}
            {phase === "idle" && (
              <div className="flex flex-col gap-2">
                {error && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-left text-xs text-red-600 ring-1 ring-red-200 dark:bg-red-500/10 dark:ring-red-500/30">
                    <AlertTriangle className="size-4 shrink-0" />
                    {error}
                  </div>
                )}
                <button
                  type="button"
                  disabled={noContacts}
                  onClick={() => void handleArmSos()}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-red-600 text-base font-semibold text-white shadow-lg shadow-red-600/30 transition hover:bg-red-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <HeartPulse className="size-5" />
                  Send SOS
                </button>
                {noContacts ? (
                  <Link
                    href="/contacts"
                    className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    <Users className="size-4" />
                    Add a trusted contact first
                  </Link>
                ) : (
                  <Link
                    href="/contacts"
                    className="text-center text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Manage your SOS contacts
                  </Link>
                )}
              </div>
            )}

            {phase === "countdown" && (
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-card/90 px-5 py-6 ring-1 ring-red-600/25">
                <div className="text-5xl font-bold tabular-nums text-red-600">{countdown}</div>
                <p className="text-sm text-muted-foreground">
                  {micDenied ? "Sending SOS in" : "Recording + sending SOS in"} {countdown}s
                </p>
                <button
                  type="button"
                  onClick={cancelCountdown}
                  className="inline-flex h-10 w-full items-center justify-center rounded-full border border-input bg-background text-sm font-semibold transition hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            )}

            {(phase === "mic" || phase === "sending") && (
              <div className="flex items-center gap-3 rounded-2xl bg-card/80 px-5 py-5 ring-1 ring-border/60">
                <Loader2 className="size-6 animate-spin text-red-600" />
                <p className="text-sm text-muted-foreground">
                  {phase === "mic" ? "Requesting microphone access…" : "Sending SOS to contacts…"}
                </p>
              </div>
            )}

            {phase === "error" && (
              <div className="flex flex-col items-start gap-2 rounded-2xl bg-red-50 px-5 py-5 ring-1 ring-red-200 dark:bg-red-500/10 dark:ring-red-500/30">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
                  <AlertTriangle className="size-4" />
                  Couldn't send SOS
                </div>
                <p className="text-xs text-red-500">{error}</p>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void runSos()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700"
                  >
                    <RotateCcw className="size-4" />
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex h-9 items-center rounded-full border border-input bg-background px-4 text-sm font-semibold transition hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {phase === "live" && (
              <div className="flex flex-col gap-2 rounded-2xl bg-card/80 p-4 ring-1 ring-red-600/25">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-red-600">
                    <span className="size-2.5 animate-pulse rounded-full bg-red-600" />
                    SOS active
                    {recStatus === "recording" ? " · recording" : ""}
                  </span>
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {formatTime(elapsed)}
                  </span>
                </div>

                {confirmEnd ? (
                  <div className="flex flex-col gap-2 rounded-xl bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-500/10 dark:ring-red-500/30">
                    <p className="text-sm font-semibold text-red-600">End SOS now?</p>
                    <p className="text-xs text-muted-foreground">
                      Tracking and audio recording will stop. Your contacts have already been
                      alerted.
                    </p>
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleEndSos()}
                        className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-red-600 text-sm font-semibold text-white transition hover:bg-red-700"
                      >
                        Yes, end SOS
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmEnd(false)}
                        className="inline-flex h-10 flex-1 items-center justify-center rounded-full border border-input bg-background text-sm font-semibold transition hover:bg-muted"
                      >
                        Keep active
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmEnd(true)}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-red-600 text-base font-semibold text-white shadow-lg shadow-red-600/30 transition hover:bg-red-700 active:scale-[0.99]"
                    >
                      End SOS
                    </button>

                    <button
                      type="button"
                      onClick={() => void toggleRecording()}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-input bg-background px-3 text-xs font-semibold text-muted-foreground transition hover:bg-muted"
                    >
                      {recStatus === "recording" ? (
                        <>
                          <Square className="size-3.5" />
                          Stop recording
                        </>
                      ) : (
                        <>
                          <MicOff className="size-3.5" />
                          Start recording
                        </>
                      )}
                    </button>
                  </>
                )}

                <SavedStrip
                  status={recStatus}
                  meta={recordingMeta}
                  downloadUrl={downloadUrl}
                  onDelete={handleDeleteRecording}
                />

                {deliveries.length > 0 && (
                  <div className="rounded-xl bg-muted/40 px-3 py-2 ring-1 ring-border/50">
                    <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                      Contacts alerted
                    </p>
                    <ul className="flex flex-col gap-1">
                      {deliveries.map((d) => (
                        <li key={d.phone} className="flex items-center gap-2 text-xs">
                          <span
                            className={`size-3.5 shrink-0 rounded-full ${
                              d.delivered ? "bg-emerald-500" : "bg-amber-500"
                            }`}
                            aria-hidden
                          />
                          <span className="truncate text-foreground">{d.name}</span>
                          <span className="ml-auto shrink-0 text-muted-foreground">
                            {d.delivered
                              ? "Location + SMS sent"
                              : "Not reached yet"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {phase === "ended" && (
              <div className="flex flex-col items-start gap-3 rounded-2xl bg-card/80 p-5 ring-1 ring-border/60">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                  <CheckCircle2 className="size-4" />
                  SOS ended
                </div>
                {sent && (
                  <p className="text-xs text-muted-foreground">
                    Alerted {countDelivered(sent)} contact{countDelivered(sent) === 1 ? "" : "s"}.
                  </p>
                )}
                <SavedStrip
                  status={recStatus}
                  meta={recordingMeta}
                  downloadUrl={downloadUrl}
                  onDelete={handleDeleteRecording}
                />
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex h-9 items-center rounded-full bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700"
                >
                  Done
                </button>
              </div>
            )}

            {/* Live map */}
            <div className="overflow-hidden rounded-2xl ring-1 ring-border/60">
              <SafetyMap center={position} points={mapPoints} height={300} zoom={14} />
            </div>
            {geoDenied && (
              <p className="text-[11px] text-amber-600">
                Live tracking is off — showing the default Delhi location.
              </p>
            )}
            <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="text-sm leading-none">📍</span> You
              </span>
              {Object.values(SERVICE_META)
                .filter((m) => m.label !== "Helpline")
                .map((m) => (
                  <span key={m.label} className="flex items-center gap-1">
                    <span
                      className="inline-block size-3"
                      style={{
                        WebkitMaskImage: `url("data:image/svg+xml,${encodeURIComponent(
                          `<svg width="24" height="24" viewBox="0 0 38 44" xmlns="http://www.w3.org/2000/svg"><path d="M19 43s-15-11.4-15-24a15 15 0 1 1 30 0c0 12.6-15 24-15 24Z" fill="#000"/></svg>`,
                        )}")`,
                        WebkitMaskSize: "contain",
                        backgroundColor: m.color,
                      }}
                    />
                    {m.label}
                  </span>
                ))}
            </div>
          </section>

          {/* RIGHT — nearby help, always visible */}
          <aside className="lg:sticky lg:top-2 lg:max-h-[calc(100lvh-2rem)] lg:overflow-y-auto lg:pb-2">
                        <NearbyHelp
              services={services}
              loading={servicesLoading}
              error={servicesError}
              locationDenied={geoDenied}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}

function SavedStrip({
  status,
  meta,
  downloadUrl,
  onDelete,
}: {
  status: RecStatus;
  meta: SavedRecording | null;
  downloadUrl: string | null;
  onDelete: () => void;
}) {
  if (status !== "saved" || !meta) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 ring-1 ring-emerald-500/20">
      <Download className="size-3.5 text-emerald-600" />
      <p className="truncate text-xs text-emerald-700">
        Saved on this device · {formatSize(meta.size)}
      </p>
      {downloadUrl && (
        <a
          href={downloadUrl}
          download={meta.name}
          className="shrink-0 text-xs font-semibold text-emerald-700 underline hover:no-underline"
        >
          Download
        </a>
      )}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete local recording"
        className="shrink-0 text-muted-foreground transition hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function formatTime(totalSec: number): string {
  return `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countDelivered(result: SosTriggerResult): number {
  return result.notifiedContacts.filter((c) => c.delivered).length;
}
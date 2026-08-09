"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  Flame,
  HeartPulse,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  RotateCcw,
  Square,
  Stethoscope,
  Trash2,
  Users,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  fetchContacts,
  triggerSos,
  updateSosLocation,
  uploadSosMedia,
  type SosTriggerResult,
  type TrustedContact,
} from "@/lib/api";
import { cacheTrustedContacts, cachedTrustedContacts, isNetworkError } from "@/lib/offline";
import {
  enqueueOutbox,
  listOutbox,
  removeOutbox,
  type OutboxOp,
} from "@/lib/sos-outbox";
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
/** While recording, auto-share a fresh audio clip to contacts every minute. */
const AUDIO_SHARE_SECONDS = 60;
/** Periodic live-location refresh sent to contacts while SOS is active. */
const LOCATION_UPDATE_SECONDS = 300;

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

const SERVICE_ICON: Record<EmergencyType, typeof Building2> = {
  police: Building2,
  hospital: Stethoscope,
  fire: Flame,
  helpline: Phone,
};

const ServiceGlyph = ({ type }: { type: EmergencyType }) => {
  const Icon = SERVICE_ICON[type];
  return <Icon className="size-4" />;
};

/**
 * Rich hover/click card for a nearby emergency service — renders its own white
 * surface so it reads clearly over the map, matching the live-risk map cards.
 */
function ServiceTooltip({ service }: { service: EmergencyService }) {
  const meta = SERVICE_META[service.type];
  return (
    <div className="w-[232px] rounded-xl border border-zinc-200/80 bg-white text-zinc-900 shadow-[0_16px_40px_rgba(24,24,27,0.24),0_0_0_1px_rgba(24,24,27,0.04)]">
      <div className="flex items-start gap-2.5 px-3 pt-3">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-black/5"
          style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}
        >
          <ServiceGlyph type={service.type} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] leading-snug font-bold tracking-tight">
            {service.name}
          </p>
          <p className="mt-0.5 text-[10.5px] font-medium text-zinc-500">
            {meta.label}
            {service.distanceLabel ? ` · ${service.distanceLabel}` : ""}
          </p>
          {service.phone ? (
            <p className="mt-1 text-[11px] font-semibold text-zinc-800">{service.phone}</p>
          ) : null}
        </div>
      </div>
      {service.address ? (
        <p className="px-3 pt-1.5 text-[10.5px] leading-snug text-zinc-500 line-clamp-2">
          {service.address}
        </p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-100 px-3 py-2">
        <a
          href={mapsUrlFor(service.lat ?? 0, service.lng ?? 0)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10.5px] font-semibold text-zinc-500 transition-colors hover:text-zinc-900"
        >
          Open in Maps
        </a>
        {service.phone ? (
          <a
            href={`tel:${service.phone}`}
            className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1.5 text-[11px] leading-none font-bold text-white shadow-sm transition hover:bg-red-700"
          >
            <Phone className="size-3" />
            Call
          </a>
        ) : null}
      </div>
    </div>
  );
}

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
  // Active SOS event id + a guard so snapshots never overlap.
  const eventIdRef = useRef<string | null>(null);
  const snapshotBusyRef = useRef(false);
  // Client-generated id for the local outbox session (used while offline).
  const sosKeyRef = useRef<string | null>(null);

  // Track connectivity: SOS must keep recording/queuing when offline.
  const [offline, setOffline] = useState(false);

  /** Replay any SOS events queued while offline, oldest first. */
  const flushOutbox = useCallback(async () => {
    const ops = await listOutbox();
    if (ops.length === 0) return;
    const eventIds = new Map<string, string>();
    let synced = 0;
    let stopped = false;
    for (const op of ops) {
      if (stopped) break;
      try {
        if (op.kind === "sos") {
          const res = await triggerSos(op.payload);
          eventIds.set(op.sosKey, res.event.id);
          if (op.sosKey === sosKeyRef.current) eventIdRef.current = res.event.id;
        } else if (op.kind === "loc") {
          const eventId = eventIds.get(op.sosKey);
          if (!eventId) continue;
          await updateSosLocation({ eventId, ...op.payload });
        } else {
          const eventId = eventIds.get(op.sosKey);
          if (!eventId) continue;
          await uploadSosMedia(eventId, op.blob);
        }
        await removeOutbox(op.id);
        synced += 1;
      } catch (caught) {
        if (isNetworkError(caught) || (caught instanceof ApiError && caught.status === 401)) {
          stopped = true; // offline or signed out — wait
        } else if (caught instanceof ApiError) {
          await removeOutbox(op.id); // non-fatal server error — drop this op
          synced += 1;
        }
      }
    }
    if (synced > 0) {
      toast.success("Your offline SOS reached your trusted contacts");
    }
  }, []);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      void flushOutbox();
    };
    setOffline(!navigator.onLine);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On first load, if there is connectivity, flush anything the device queued
  // during an earlier offline emergency.
  useEffect(() => {
    if (navigator.onLine) void flushOutbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // While SOS is live, keep pushing the latest location to contacts: whenever
  // the user moves significantly AND as a periodic ping (in case GPS stalls),
  // both reusing the same active event. Offline, the updates are queued and
  // replayed once the device is back online. Failures never crash the page.
  useEffect(() => {
    if (phase !== "live") return;
    const pushLocation = async (notifyMoved: boolean) => {
      const current = positionRef.current;
      const eventId = eventIdRef.current;
      if (!eventId) {
        // Offline session — save for later replay.
        const sosKey = sosKeyRef.current;
        if (!sosKey) return;
        await enqueueOutbox({
          id: `loc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: "loc",
          sosKey,
          payload: {
            latitude: current.lat,
            longitude: current.lng,
            location: mapsUrlFor(current.lat, current.lng),
          },
          at: Date.now(),
        });
        return;
      }
      try {
        await updateSosLocation({
          eventId,
          latitude: current.lat,
          longitude: current.lng,
          location: mapsUrlFor(current.lat, current.lng),
        });
        if (notifyMoved) toast.success("Live location shared with your contacts");
      } catch (caught) {
        if (isNetworkError(caught) && sosKeyRef.current) {
          await enqueueOutbox({
            id: `loc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            kind: "loc",
            sosKey: sosKeyRef.current,
            payload: {
              latitude: current.lat,
              longitude: current.lng,
              location: mapsUrlFor(current.lat, current.lng),
            },
            at: Date.now(),
          });
        } else {
          toast.error("Couldn't share your updated location. Keep moving — we'll retry.");
        }
      }
    };
    const sendUpdate = async () => {
      const current = positionRef.current;
      const last = lastSentRef.current;
      const moved = haversineKm(last.lat, last.lng, current.lat, current.lng);
      if (!moved || moved < MOVE_THRESHOLD_KM) return;
      lastSentRef.current = current;
      await pushLocation(true);
    };
    // Short-interval ping so contacts always have a fresh location.
    const moveId = window.setInterval(() => void sendUpdate(), LOCATION_CHECK_MS);
    // Steadier "again and again" refresh while the SOS stays active.
    const pingerId = window.setInterval(
      () => void pushLocation(false),
      LOCATION_UPDATE_SECONDS * 1000,
    );
    return () => {
      window.clearInterval(moveId);
      window.clearInterval(pingerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // While recording, an un-stopped mic auto-shares a fresh audio clip to the
  // contacts every minute; recording immediately continues. Offline, the clip
  // is queued locally and uploaded once connectivity returns.
  useEffect(() => {
    if (
      phase !== "live" ||
      recStatus !== "recording" ||
      !(eventIdRef.current || sosKeyRef.current)
    )
      return;
    const id = window.setInterval(
      () => void shareAudioSnapshot(eventIdRef.current),
      AUDIO_SHARE_SECONDS * 1000,
    );
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, recStatus]);

  useEffect(() => {
    if (isPending || !session) return;
    let cancelled = false;
    setContactsLoading(true);
    // Seed from the offline cache first so SOS can be armed even with no
    // connection; the network refresh below overwrites with fresh data.
    const cached = cachedTrustedContacts();
    if (cached.length > 0) setContacts(cached);
    fetchContacts()
      .then((data) => {
        cacheTrustedContacts(data);
        if (!cancelled) setContacts(data);
      })
      .catch(() => {
        if (!cancelled && cached.length > 0) setContacts(cached);
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

  /**
   * Auto-share the current live audio with trusted contacts. Because this fires
   * on the "not stopped within the minute" rule, the recorder is re-started so
   * capture never stops while the SOS is active. With no connectivity the clip
   * is queued locally and uploaded after reconnect.
   */
  const shareAudioSnapshot = useCallback(
    async (eventId: string | null) => {
      if (snapshotBusyRef.current) return;
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") return;
      snapshotBusyRef.current = true;
      let restarted = true;
      try {
        const rec = await stopMicRecording();
        if (rec && rec.blob.size >= 1024) {
          if (eventId) {
            await uploadSosMedia(eventId, rec.blob);
          } else if (sosKeyRef.current) {
            await enqueueOutbox({
              id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              kind: "media",
              sosKey: sosKeyRef.current,
              mimeType: rec.blob.type,
              blob: rec.blob,
              at: Date.now(),
            });
          }
          toast.success("Live audio auto-shared with your contacts");
        }
        restarted = await startMicRecording();
      } catch {
        restarted = await startMicRecording().catch(() => false);
        toast.error("Couldn't share live audio — recording continues.");
      } finally {
        if (!restarted) setMicDenied(true);
        snapshotBusyRef.current = false;
      }
    },
    [stopMicRecording, startMicRecording],
  );

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

  // Press the button → require a session first, then mic + countdown.
  async function handleArmSos() {
    if (phase !== "idle") return;
    if (!session) {
      router.push("/login?redirect=/sos");
      return;
    }
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
    // No real connectivity → keep the whole SOS alive on-device and queue it.
    if (offline) {
      await enterOfflineSos(batteryLevel);
      return;
    }
    try {
      const result = await triggerSos({
        latitude: position.lat,
        longitude: position.lng,
        batteryLevel,
        location: mapsUrlFor(position.lat, position.lng),
        emergencyMessage: EMERGENCY_MESSAGE,
      });
lastSentRef.current = position;
      eventIdRef.current = result.event.id;
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
      if (isNetworkError(caught)) {
        // Connection dropped in the middle of sending — queue it.
        await enterOfflineSos(batteryLevel);
        return;
      }
      setError(caught instanceof Error ? caught.message : "Couldn't send SOS. Try again.");
      setPhase("error");
    }
  }

  /** Start a fully local SOS: continue recording/tracking, save everything for
   *  replay, and let the user fall back to the phone's SMS app right away. */
  async function enterOfflineSos(batteryLevel?: number) {
    const sosKey = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sosKeyRef.current = sosKey;
    eventIdRef.current = null;
    setSent(null);
    await enqueueOutbox({
      id: `sos-${Date.now()}`,
      kind: "sos",
      sosKey,
      payload: {
        latitude: position.lat,
        longitude: position.lng,
        batteryLevel,
        location: mapsUrlFor(position.lat, position.lng),
        emergencyMessage: EMERGENCY_MESSAGE,
      },
      at: Date.now(),
    });
    lastSentRef.current = position;
    setPhase("live");
    toast.warning(
      "Offline — SOS is recording and saved to your device. It will auto-send the moment you're back online, or use your phone's SMS now.",
    );
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
    eventIdRef.current = null;
    sosKeyRef.current = null;
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
    eventIdRef.current = null;
    sosKeyRef.current = null;
  }

  const noContacts = !contactsLoading && contacts.length === 0;

  // Markers for the live map: your position + each nearby service. Always
  // include at least 2 of each of police / hospital / fire, then fill with the
  // nearest remaining services. Service pins are memoised independently of the
  // live point so frequent geolocation updates never re-create (and re-hover)
  // all the markers — the map stays smooth while a tooltip is open.
  const servicePoints = useMemo(() => {
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
    return selected.map((s) => ({
      id: s.id,
      lat: s.lat!,
      lng: s.lng!,
      color: SERVICE_META[s.type].color,
      glyph: SERVICE_META[s.type].glyph,
      hover: <ServiceTooltip service={s} />,
      popup: <ServiceTooltip service={s} />,
    }));
  }, [services]);

  const livePoint = useMemo(
    () => ({
      id: "live",
      lat: position.lat,
      lng: position.lng,
      color: "#e11d48",
      live: true as const,
    }),
    [position],
  );

  const mapPoints = useMemo(() => [livePoint, ...servicePoints], [livePoint, servicePoints]);

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
                {!isPending && !session ? (
                  <div className="flex flex-col gap-2 rounded-2xl bg-card/80 px-4 py-5 ring-1 ring-border/60">
                    <p className="text-sm font-semibold text-foreground">
                      Sign in to trigger an SOS
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Panic SOS needs your account so your trusted contacts can receive your
                      live location and alerts instantly.
                    </p>
                    <Link
                      href="/login?redirect=/sos"
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-red-600 text-base font-semibold text-white shadow-lg shadow-red-600/30 transition hover:bg-red-700 active:scale-[0.98]"
                    >
                      <HeartPulse className="size-5" />
                      Sign in to continue
                    </Link>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={noContacts && !offline}
                      onClick={() => void handleArmSos()}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-red-600 text-base font-semibold text-white shadow-lg shadow-red-600/30 transition hover:bg-red-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <HeartPulse className="size-5" />
                      Send SOS
                    </button>
                    {noContacts ? (
                      offline ? (
                        <p className="flex items-start gap-1.5 px-2 text-xs leading-relaxed text-muted-foreground">
                          <WifiOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          You're offline with no saved contacts. Your SOS is still
                          recorded on this device and will be sent once you add a
                          trusted contact and reconnect.
                        </p>
                      ) : (
                        <Link
                          href="/contacts"
                          className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
                        >
                          <Users className="size-4" />
                          Add a trusted contact first
                        </Link>
                      )
                    ) : (
                      <Link
                        href="/contacts"
                        className="text-center text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        Manage your SOS contacts
                      </Link>
                    )}
                  </>
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

                {recStatus === "recording" && (
                  <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <span className="mt-1 inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-red-600" />
                    Live audio is continuously recorded and auto-shared with every
                    trusted contact each minute. Your location goes out every 5
                    minutes.
                  </p>
                )}

                {offline && (
                  <div className="flex flex-col gap-2 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                      <WifiOff className="size-4" />
                      Offline — SOS is recorded and saved on this device
                    </p>
                    <p className="text-[11px] leading-relaxed text-amber-700/80 dark:text-amber-400/80">
                      It will auto-send to your trusted contacts as soon as you're
                      back online. To alert someone right now, hand your phone to a
                      trusted person or open your phone's SMS app below.
                    </p>
                    {contacts.length > 0 && (
                      <a
                        href={`sms:${contacts
                          .map((c) => c.phone.replace(/\D/g, ""))
                          .join(",")}?body=${encodeURIComponent(
                          `${EMERGENCY_MESSAGE} ${mapsUrlFor(position.lat, position.lng)}`,
                        )}`}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-800 transition hover:bg-amber-50 dark:border-amber-500/40 dark:bg-transparent dark:text-amber-300 dark:hover:bg-amber-500/10"
                      >
                        <MessageSquare className="size-4" />
                        Use phone's SMS now
                      </a>
                    )}
                  </div>
                )}

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
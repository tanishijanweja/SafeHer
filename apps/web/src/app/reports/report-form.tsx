"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, LocateFixed, Loader2, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@safe-her/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@safe-her/ui/components/card";
import { Label } from "@safe-her/ui/components/label";
import { Skeleton } from "@safe-her/ui/components/skeleton";
import { Textarea } from "@safe-her/ui/components/textarea";

import LocationSearch from "@/components/location-search";
import { DatePicker } from "@/components/date-picker";
import { TimePicker } from "@/components/time-picker";
import { API_URL, type GeocodeResult, reverseGeocode } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

const SafetyMap = dynamic(() => import("@/components/safety-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center border border-input text-xs text-muted-foreground">
      Loading map...
    </div>
  ),
});

const DEFAULT_LOCATION = { lat: 28.61, lng: 77.2 };

const DRAFT_KEY = "safeher-report-draft";

type ReportDraft = {
  description?: string;
  incidentDate?: string | null;
  incidentTime?: string | null;
  lat?: number;
  lng?: number;
};

function loadDraft(): ReportDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as ReportDraft) : null;
  } catch {
    return null;
  }
}

export default function ReportPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [description, setDescription] = useState("");
  const [incidentDate, setIncidentDate] = useState<Date | null>(null);
  const [incidentTime, setIncidentTime] = useState<string | null>(null);
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [address, setAddress] = useState<string | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const didRestoreRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    reverseGeocode(location.lat, location.lng).then((addr) => {
      if (!cancelled) setAddress(addr);
    });
    return () => {
      cancelled = true;
    };
  }, [location]);

  // GPS stays the default location source. The button below lets the user
  // re-request it at any time (e.g. after they tried manual selection).
  const requestLocation = useCallback(
    (notify = false) => {
      if (!navigator.geolocation) {
        setLocationDenied(true);
        setLocating(false);
        return;
      }
      setLocating(true);
      setLocationDenied(false);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setLocating(false);
          if (notify) toast.success("Location captured");
        },
        () => {
          setLocationDenied(true);
          setLocating(false);
          if (notify) toast.error("Could not fetch your location");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    },
    [],
  );

  // Restore a saved draft (e.g. after signing in) so nothing typed is lost.
  useEffect(() => {
    const draft = loadDraft();
    if (!draft) return;
    const meaningful =
      Boolean(draft.description?.trim()) ||
      Boolean(draft.incidentDate) ||
      Boolean(draft.incidentTime) ||
      (typeof draft.lat === "number" &&
        typeof draft.lng === "number" &&
        (draft.lat !== DEFAULT_LOCATION.lat || draft.lng !== DEFAULT_LOCATION.lng));
    if (!meaningful) return;
    if (draft.description) setDescription(draft.description);
    if (draft.incidentDate) setIncidentDate(new Date(draft.incidentDate));
    if (draft.incidentTime) setIncidentTime(draft.incidentTime);
    if (typeof draft.lat === "number" && typeof draft.lng === "number") {
      setLocation({ lat: draft.lat, lng: draft.lng });
      didRestoreRef.current = true;
    }
  }, []);

  // Keep the draft in sync so a mid-report sign-in never loses the details.
  useEffect(() => {
    const meaningful =
      description.trim().length > 0 || Boolean(incidentDate) || Boolean(incidentTime);
    try {
      if (!meaningful) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          description,
          incidentDate: incidentDate?.toISOString() ?? null,
          incidentTime,
          lat: location.lat,
          lng: location.lng,
        }),
      );
    } catch {
      // ignore storage access errors (private mode)
    }
  }, [description, incidentDate, incidentTime, location]);

  useEffect(() => {
    // Skip the auto-GPS grab when a restored draft already pinned a spot.
    if (didRestoreRef.current) return;
    requestLocation();
  }, [requestLocation]);

  function handleManualSelect(result: GeocodeResult) {
    setLocation({ lat: result.lat, lng: result.lng });
    setAddress(result.displayName);
    setLocationDenied(false);
  }

  // Combine the optionally-selected date and approximate time into a single
  // timestamp. A time without a date defaults to today; a date without a time
  // keeps midnight.
  function combineDateTime(): Date | null {
    if (!incidentDate && !incidentTime) return null;
    const base = incidentDate ? new Date(incidentDate) : new Date();
    if (incidentTime) {
      const [h, m] = incidentTime.split(":").map(Number);
      if (Number.isFinite(h) && Number.isFinite(m)) base.setHours(h, m, 0, 0);
    }
    return base;
  }

  const descriptionTrimmed = description.trim();
  const canSubmit =
    descriptionTrimmed.length >= 10 && !submitting;

  async function handleSubmit() {
    if (!session) {
      toast.error("Please sign in to report an incident");
      router.push("/login?redirect=/reports%3Fview%3Dreport");
      return;
    }

    if (descriptionTrimmed.length < 10) {
      toast.error("Please describe the incident in at least a sentence (10+ characters).");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          description,
          latitude: location.lat,
          longitude: location.lng,
          incidentDate: combineDateTime()?.toISOString(),
        }),
      });

      if (res.status === 401) {
        router.push("/login?redirect=/reports%3Fview%3Dreport");
        return;
      }

      if (res.status === 409) {
        toast.success("This incident was already reported — thank you!");
        router.push("/reports?view=feed");
        return;
      }

      if (!res.ok) {
        toast.error("We couldn't submit your report. Please try again.");
        return;
      }

      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore storage access errors (private mode)
      }
      toast.success("Report submitted — thank you for making the map safer.");
      router.push("/reports?view=feed");
    } finally {
      setSubmitting(false);
    }
  }

  if (isPending) {
    return (
      <main className="flex justify-center p-6">
        <Skeleton className="h-80 w-full max-w-xl rounded-2xl" />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex justify-center p-6">
        <Card className="w-full max-w-xl rounded-2xl">
          <CardHeader>
            <CardTitle>Report Incident</CardTitle>
            <CardDescription>
              Describe what happened and select the location on the map.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-start gap-3 rounded-2xl bg-primary/5 p-5 ring-1 ring-primary/15">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
                <UserRoundPlus className="size-5" />
              </span>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">
                  Sign in to report an incident
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Reports are tied to your account so nearby alerts stay accurate.
                  Sign in first — we&apos;ll keep your draft, so nothing you type is
                  lost.
                </p>
              </div>
              <Link
                href="/login?redirect=/reports%3Fview%3Dreport"
                className="inline-flex"
              >
                <Button className="h-9 rounded-full px-4 text-xs font-semibold">
                  Sign in to continue
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex justify-center p-6">
      <Card className="w-full max-w-xl rounded-2xl">
        <CardHeader>
          <CardTitle>Report Incident</CardTitle>
          <CardDescription>
            Describe what happened and select the location on the map.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">
              Description{" "}
              <span className="ml-1 font-normal text-muted-foreground">(required)</span>
            </Label>
            <Textarea
              id="description"
              placeholder="Describe what happened, where, and any details that could help others avoid the same spot…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className="rounded-2xl"
            />
            <p className="text-[11px] text-muted-foreground">
              {descriptionTrimmed.length}/2000 characters
              {descriptionTrimmed.length > 0 && descriptionTrimmed.length < 10
                ? " — a short sentence helps the AI grade severity better"
                : ""}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="incident-date">Date of incident (optional)</Label>
            <DatePicker
              id="incident-date"
              value={incidentDate}
              maxDate={new Date()}
              onSelect={(d) => setIncidentDate(d ?? null)}
              placeholder="Select the date it happened"
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="incident-time">Approximate time (optional)</Label>
            <TimePicker
              id="incident-time"
              value={incidentTime}
              onSelect={(t) => setIncidentTime(t)}
              placeholder="Select the time if you remember it"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Not sure? Pick a rough time slot — it helps the heatmap.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Location</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => requestLocation(true)}
                disabled={locating}
                className="shrink-0 rounded-lg"
              >
                {locating ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <LocateFixed aria-hidden />
                )}
                Use Current Location
              </Button>
              <span className="text-xs text-muted-foreground">
                or search for a place below
              </span>
            </div>
            {locationDenied && (
              <p className="text-xs text-red-500">
                Location access is blocked. Search for a place below or click the map to
                select a location manually.
              </p>
            )}
            <LocationSearch
              onSelect={handleManualSelect}
              placeholder="Search a Delhi locality or address…"
            />
            <p className="text-xs text-muted-foreground">
              {address ? address : "Resolving address..."}
            </p>
            <SafetyMap
              center={location}
              height={320}
              points={[
                {
                  id: "location-pin",
                  lat: location.lat,
                  lng: location.lng,
                  draggable: true,
                },
              ]}
              onMapClick={(lat, lng) => setLocation({ lat, lng })}
              onPointDragEnd={(_id, lat, lng) => setLocation({ lat, lng })}
              className="overflow-hidden rounded-2xl ring-1 ring-border"
            />
            <p className="text-[11px] text-muted-foreground">
              Drag the pin or tap the map to fine-tune the exact spot.
            </p>
          </div>

          <Button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="h-11 rounded-xl text-sm font-semibold"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Submitting…
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" aria-hidden />
                Submit report
              </>
            )}
          </Button>
          {!submitting && descriptionTrimmed.length < 10 && (
            <p className="-mt-2 text-center text-[11px] text-muted-foreground">
              Describe the incident in at least a sentence to submit.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

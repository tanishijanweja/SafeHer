"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ImagePlus, LocateFixed, Loader2, X } from "lucide-react";
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

export default function ReportPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [description, setDescription] = useState("");
  const [incidentDate, setIncidentDate] = useState<Date | null>(null);
  const [incidentTime, setIncidentTime] = useState<string | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [address, setAddress] = useState<string | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [locating, setLocating] = useState(false);

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

  useEffect(() => {
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

  async function handleSubmit() {
    if (!session) {
      toast.error("Please login first to report an incident");
      router.push("/login?redirect=/reports");
      return;
    }

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
      router.push("/login?redirect=/reports");
      return;
    }

    if (res.status === 409) {
      toast.success("Thank you, this report was already submitted");
      return;
    }

    if (!res.ok) {
      toast.error("Failed to submit report. Please try again.");
      return;
    }

    toast.success("Report submitted");
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
            <Label htmlFor="description">Description</Label>
            <div className="relative">
              <Textarea
                id="description"
                placeholder="Describe the incident..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-2xl pr-11"
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                aria-label="Attach an image"
                title="Attach an image"
                className="absolute right-2 bottom-2 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ImagePlus className="size-4" aria-hidden />
              </button>
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
            />
            {image ? (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-muted/70 px-2 py-1 text-xs text-foreground ring-1 ring-border/60">
                <ImagePlus className="size-3 text-muted-foreground" aria-hidden />
                <span className="max-w-40 truncate">{image.name}</span>
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  aria-label="Remove image"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ) : null}
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
              points={[{ lat: location.lat, lng: location.lng }]}
              onMapClick={(lat, lng) => setLocation({ lat, lng })}
              className="overflow-hidden rounded-2xl ring-1 ring-border"
            />
          </div>

          <Button onClick={handleSubmit} className="rounded-lg">
            Submit
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

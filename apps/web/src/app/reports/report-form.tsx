"use client";

import { useCallback, useEffect, useState } from "react";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2, LocateFixed } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@safe-her/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@safe-her/ui/components/card";
import { Input } from "@safe-her/ui/components/input";
import { Label } from "@safe-her/ui/components/label";
import { Textarea } from "@safe-her/ui/components/textarea";

import LocationSearch from "@/components/location-search";
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
  const [image, setImage] = useState<File | null>(null);
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
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Report Incident</CardTitle>
          <CardDescription>
            Describe what happened and select the location on the map.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the incident..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="image">Image</Label>
            <Input
              id="image"
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
            />
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
                className="shrink-0"
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
            />
          </div>

          <Button onClick={handleSubmit}>Submit</Button>
        </CardContent>
      </Card>
    </main>
  );
}

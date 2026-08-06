"use client";

import { useEffect, useState } from "react";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
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

import { API_URL } from "@/lib/api";
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
  const [locationDenied, setLocationDenied] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => setLocationDenied(true),
    );
  }, []);

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
            {locationDenied && (
              <p className="text-xs text-red-500">
                Location access is blocked. Please enable it in your browser, or select a
                location manually on the map.
              </p>
            )}
            <SafetyMap
              center={location}
              height={320}
              points={[{ lat: location.lat, lng: location.lng }]}
              onMapClick={(lat, lng) => setLocation({ lat, lng })}
            />
            <p className="text-xs text-muted-foreground">
              Latitude: {location.lat.toFixed(5)}, Longitude: {location.lng.toFixed(5)}
            </p>
          </div>

          <Button onClick={handleSubmit}>Submit</Button>
        </CardContent>
      </Card>
    </main>
  );
}

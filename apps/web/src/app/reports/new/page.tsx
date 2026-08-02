"use client";

import { Camera, Clock, Crosshair, Loader2, MapPin, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@safe-her/ui/components/button";
import { Input } from "@safe-her/ui/components/input";
import { Label } from "@safe-her/ui/components/label";
import { Textarea } from "@safe-her/ui/components/textarea";

import RequireAuth from "@/components/require-auth";
import { SafeMap, type SafeHeatCell, type SafeMarker } from "@/components/safe-map";
import { SeverityBadge } from "@/components/ui-helpers";
import { analyzeHeuristic } from "@/lib/ai";
import { useActiveUser } from "@/lib/auth";
import { fileToImageUrl } from "@/lib/image";
import { computeRiskScores, createReport, ensureSeeded, getReports } from "@/lib/store";
import { categoryLabel, type GeoPoint } from "@/lib/types";
import { useStoreVersion } from "@/lib/use-store";

export default function NewReportPage() {
  return (
    <RequireAuth>
      <NewReportForm />
    </RequireAuth>
  );
}

function NewReportForm() {
  useStoreVersion();
  const router = useRouter();
  const { user } = useActiveUser();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const now = useMemo(() => new Date(), []);
  const analysis = useMemo(() => analyzeHeuristic(description), [description]);

  const previewHeat: SafeHeatCell[] = useMemo(() => {
    if (!point) return [];
    const cells = computeRiskScores().map((r) => ({
      lat: r.latitude,
      lng: r.longitude,
      score: r.combined_score,
    }));
    return [...cells, { lat: point.lat, lng: point.lng, score: analysis.severity }];
  }, [point, analysis.severity]);

  const previewMarkers: SafeMarker[] = useMemo(() => {
    return getReports()
      .filter((r) => !r.is_spam)
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        lat: r.latitude,
        lng: r.longitude,
        kind: "report" as const,
        severity: r.severity,
      }));
  }, []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    try {
      const url = await fileToImageUrl(file);
      setImage(url);
      setImageFile(file);
    } catch {
      toast.error("Could not read that image");
    }
  };

  const locateMe = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not available in this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast.success("Location captured");
      },
      () => {
        setLocating(false);
        toast.error("Could not get your location — tap the map instead");
      },
      { timeout: 8000 },
    );
  };

  const submit = async () => {
    if (!point) {
      toast.error("Tap the map to pin where this happened");
      return;
    }
    if (!title.trim()) {
      toast.error("Give the report a short title");
      return;
    }
    if (!description.trim()) {
      toast.error("Describe what happened");
      return;
    }
    setSubmitting(true);
    try {
      const report = await createReport({
        title: title.trim(),
        description: description.trim(),
        latitude: point.lat,
        longitude: point.lng,
        image_url: image,
        user_id: user?.id ?? "test-user-001",
      });
      toast.success(
        report.is_spam
          ? "Report saved — flagged as spam"
          : `Report saved · AI severity ${report.severity}/5`,
      );
      router.push(`/reports/${report.id}`);
    } catch {
      toast.error("Something went wrong while saving");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = Boolean(point && title.trim() && description.trim());

  return (
    <div className="safeher-glow mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-foreground">Report an incident</h1>
        <p className="text-xs text-muted-foreground/50">
          Your report feeds the community risk map. It saves instantly — even if AI analysis is slow.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        {/* Left: form */}
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Harassed near metro exit at night"
              className="rounded-lg border-pink-400/20 bg-card/80 text-foreground placeholder:text-muted-foreground/30"
              maxLength={120}
            />
          </Field>

          <Field label="What happened?">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you saw or experienced. Be specific about the place, time and people involved."
              rows={5}
              className="rounded-lg border-pink-400/20 bg-card/80 text-foreground placeholder:text-muted-foreground/30"
            />
          </Field>

          <Field label="Photo (optional)">
            {image ? (
              <div className="relative overflow-hidden rounded-lg border border-pink-400/25">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="Upload preview" className="h-40 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setImage(null);
                    setImageFile(null);
                  }}
                  className="absolute right-2 top-2 rounded-full border border-pink-400/30 bg-card/90 px-2.5 py-1 text-[10px] text-foreground hover:bg-pink-500/30"
                >
                  Remove
                </button>
                <span className="absolute bottom-2 left-2 rounded-full bg-card/90 px-2 py-0.5 text-[10px] text-muted-foreground/70">
                  {imageFile?.name}
                </span>
              </div>
            ) : (
              <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-pink-400/25 bg-card/80 text-muted-foreground/60 transition hover:border-pink-400/60 hover:bg-pink-500/5">
                <Camera className="size-6 text-primary" />
                <span className="text-xs">Click to upload a photo</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </label>
            )}
          </Field>

          {/* Auto-filled time */}
          <Field label="Reported at (auto-filled)">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-pink-400/20 bg-card/80 px-2.5 text-xs text-muted-foreground/70">
              <Clock className="size-3.5 text-primary" />
              {now.toLocaleString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </Field>
        </div>

        {/* Right: location + AI preview */}
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-2xl border border-pink-400/15 bg-card/80">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pink-400/15 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <MapPin className="size-4 text-primary" /> Location
              </span>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={locateMe}
                className="rounded-full border-pink-400/30 text-foreground"
                disabled={locating}
              >
                <Crosshair className="size-3.5" />
                {locating ? "Locating…" : "Use my location"}
              </Button>
            </div>
            <div className="h-72">
              <SafeMap
                heat={previewHeat}
                markers={previewMarkers}
                selectable
                onSelectPoint={setPoint}
                selectedPoint={point}
              />
            </div>
            <div className="flex items-center justify-between border-t border-pink-400/15 bg-card/80 px-3 py-2 text-[11px]">
              <span className="font-mono text-muted-foreground/70">
                {point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : "No location set"}
              </span>
              <span className="text-muted-foreground/40">grid cell = 600m (geohash-6)</span>
            </div>
          </div>

          {/* AI preview */}
          <div className="rounded-2xl border border-pink-400/15 bg-card/80 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Loader2 className="size-4 text-primary" /> AI analysis preview
              </span>
              <span className="rounded-full border border-pink-400/25 bg-pink-500/10 px-2 py-0.5 text-[10px] text-muted-foreground">
                Gemini · heuristic mode
              </span>
            </div>
            <div className="flex items-center gap-3">
              <SeverityBadge severity={analysis.severity} size="lg" />
              {analysis.is_spam ? (
                <span className="rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-0.5 text-[10px] text-rose-200">
                  Likely spam
                </span>
              ) : (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-300">Looks genuine</span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground/70">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Category</span>
              <span className="rounded-full bg-pink-500/10 px-2 py-0.5 text-foreground">
                {categoryLabel(analysis.category)}
              </span>
            </div>
            {analysis.keywords.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {analysis.keywords.map((k) => (
                  <span key={k} className="rounded-full bg-pink-500/10 px-2 py-0.5 text-[10px] text-muted-foreground/70">
                    #{k}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <Button
            onClick={submit}
            disabled={!canSubmit || submitting}
            className="h-11 w-full rounded-full bg-pink-500 text-sm font-semibold text-white shadow-lg hover:bg-pink-600 disabled:opacity-40"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving & analysing…
              </>
            ) : (
              <>
                <Send className="size-4" /> Submit report
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px] uppercase tracking-widest text-muted-foreground/60">{label}</Label>
      {children}
    </div>
  );
}

import { env } from "@safe-her/env/web";

import type { HeatmapArea } from "@/lib/heatmap-areas";

export const API_URL = env.NEXT_PUBLIC_SERVER_URL;

export type ReportConfidence = "UNVERIFIED" | "COMMUNITY_CORROBORATED";

export type TrustedContact = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  relation: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContactInput = {
  name: string;
  phone: string;
};

export type NotifiedContact = {
  contactId: string;
  name: string;
  phone: string;
  channel: "sms" | "email";
  delivered: boolean;
};

export type SosTriggerResult = {
  event: { id: string; contactsNotified: boolean };
  notifiedContacts: NotifiedContact[];
};

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") {
      message = body.error;
    } else if (body.error && typeof body.error === "object") {
      const first = Object.values(body.error as Record<string, unknown>)[0];
      if (Array.isArray(first) && typeof first[0] === "string") {
        message = first[0];
      }
    }
  } catch {
    // fall back to the generic message
  }
  return new ApiError(res.status, message);
}

export type Report = {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  severity: number;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  aiSummary: string | null;
  isSpam: boolean;
  confidenceLevel: ReportConfidence;
  createdAt: string;
  updatedAt: string;
  geohash: string;
};

export async function fetchReports(): Promise<Report[]> {
  const res = await fetch(`${API_URL}/reports`);
  if (!res.ok) throw new Error(`Reports HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchHeatmap(): Promise<HeatmapArea[]> {
  const res = await fetch(`${API_URL}/heatmap`);
  if (!res.ok) throw new ApiError(res.status, `Heatmap HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchContacts(): Promise<TrustedContact[]> {
  const res = await fetch(`${API_URL}/contacts`, { credentials: "include" });
  if (!res.ok) throw await readError(res);
  const data = (await res.json()) as TrustedContact[];
  return Array.isArray(data) ? data : [];
}

export async function createContact(input: ContactInput): Promise<TrustedContact> {
  const res = await fetch(`${API_URL}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as TrustedContact;
}

export async function updateContact(
  id: string,
  input: ContactInput,
): Promise<TrustedContact> {
  const res = await fetch(`${API_URL}/contacts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as TrustedContact;
}

export async function deleteContact(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/contacts/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw await readError(res);
}

export async function triggerSos(input: {
  latitude?: number;
  longitude?: number;
  batteryLevel?: number;
  location?: string;
  emergencyMessage?: string;
}): Promise<SosTriggerResult> {
  const res = await fetch(`${API_URL}/sos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as SosTriggerResult;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}

export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
};

/** Approximate Delhi-NCR centre used to prioritise results for the app's region. */
const NCR_CENTER = { lat: 28.6139, lng: 77.209 };
/** Radius around the NCR centre where localities are treated as "NCR & nearby". */
const NCR_RADIUS_KM = 100;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Best-effort user location, fetched lazily and cached (never blocks a search).
// Used to bias results "near me" when the geolocation permission is granted.
let cachedUserLoc: { lat: number; lng: number } | null | undefined;
function userBias(): { lat: number; lng: number } {
  if (cachedUserLoc !== undefined) return cachedUserLoc ?? NCR_CENTER;
  cachedUserLoc = null;
  try {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          cachedUserLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        },
        () => {
          cachedUserLoc = null;
        },
        { enableHighAccuracy: true, timeout: 4000, maximumAge: 600000 },
      );
    }
  } catch {
    cachedUserLoc = null;
  }
  return NCR_CENTER;
}

/**
 * Rank results: NCR & nearby always first, then every other Indian state, each
 * group sorted by proximity to the user's location when known (else the NCR).
 */
function rankByProximity(results: GeocodeResult[]): GeocodeResult[] {
  const bias = userBias();
  const dist = (r: GeocodeResult) =>
    haversineKm(r.lat, r.lng, bias.lat, bias.lng);
  return [...results].sort((a, b) => {
    const aIn = haversineKm(a.lat, a.lng, NCR_CENTER.lat, NCR_CENTER.lng) <= NCR_RADIUS_KM;
    const bIn = haversineKm(b.lat, b.lng, NCR_CENTER.lat, NCR_CENTER.lng) <= NCR_RADIUS_KM;
    if (aIn !== bIn) return aIn ? -1 : 1;
    return dist(a) - dist(b);
  });
}

type NominatimItem = { lat?: string; lon?: string; display_name?: string };

async function searchPhotons(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  // Photon/Komoot — keyless, biased to the NCR by passing its coordinates (the
  // POI/building coverage is richer than plain Nominatim and it browse OSM POIs).
  const params = new URLSearchParams({
    q: query,
    limit: "10",
    lat: String(NCR_CENTER.lat),
    lon: String(NCR_CENTER.lng),
    lang: "en",
  });
  const res = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
  const data = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: {
        name?: string | null;
        street?: string | null;
        housenumber?: string | null;
        city?: string | null;
        state?: string | null;
        country?: string | null;
        countrycode?: string | null;
        postcode?: string | null;
      };
    }>;
  };
  return (data.features ?? []).flatMap<GeocodeResult>((f) => {
    const p = f.properties ?? {};
    // Only keep results in India; drop every other country.
    const countryName = p.country ?? "";
    if (p.countrycode?.toUpperCase() !== "IN" && !/india/i.test(countryName)) return [];
    const [lng, lat] = f.geometry?.coordinates ?? [NaN, NaN];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const displayName = [p.name, street, p.city, p.state, p.country]
      .map((s) => s?.trim())
      .filter((s): s is string => Boolean(s))
      .join(", ");
    if (!displayName) return [];
    return [{ lat, lng, displayName }];
  });
}

async function searchNominatim(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: "8",
    countrycodes: "in",
  });
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    { headers: { Accept: "application/json" }, signal },
  );
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
  const data = (await res.json()) as NominatimItem[];
  return data
    .filter((d) => d.lat && d.lon)
    .map((d) => ({
      lat: Number(d.lat),
      lng: Number(d.lon),
      displayName: d.display_name ?? "",
    }));
}

/**
 * Autocomplete a location restricted to India. Tries Photon first (better
 * POI/buildings, keyless), falls back to Nominatim (already `countrycodes=in`).
 * Results are ranked so NCR & nearby come first, then other Indian states —
 * sorted by proximity to the user's location when known, else the NCR. Results
 * from other countries are filtered out entirely.
 */
export async function geocodeSearch(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  try {
    const results = await searchPhotons(query, signal);
    if (signal?.aborted) return [];
    if (results.length > 0) return rankByProximity(results);
  } catch (e) {
    if (signal?.aborted) return [];
    // fall through to Nominatim
  }
  const results = await searchNominatim(query, signal);
  return rankByProximity(results);
}

export function formatCategory(raw: string): string {
  const labels: Record<string, string> = {
    HARASSMENT: "Harassment",
    THEFT: "Theft",
    ASSAULT: "Assault",
    SUSPICIOUS_ACTIVITY: "Suspicious Activity",
    UNSAFE_AREA: "Unsafe Area",
    OTHER: "Other",
    poor_lighting: "Poor Lighting",
    dark_alley: "Dark Alley / Isolated Spot",
  };
  if (labels[raw]) return labels[raw];
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function severityLabel(severity: number): "Mild" | "Moderate" | "Severe" {
  if (severity <= 2) return "Mild";
  if (severity <= 3) return "Moderate";
  return "Severe";
}

export function relativeTimeShort(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

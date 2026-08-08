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

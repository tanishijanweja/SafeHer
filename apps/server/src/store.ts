import { analyzeHeuristic } from "./analyze";
import type {
  Alert,
  NearbyPlace,
  Report,
  RiskScore,
  SosEvent,
  TrustedContact,
} from "./types";

/**
 * In-memory fake database for Phase 1 (Person A builds against fake data).
 *
 * Swap path (Phase 2): once Person C shares the real shared database, replace
 * each function body below with the equivalent Prisma/Supabase query. The route
 * handlers and the web app never change — only this file does.
 */

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function geohashEncode(lat: number, lng: number, precision = 6): string {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let hash = "", bit = 0, ch = 0, even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { ch = (ch << 1) | 1; lngMin = mid; } else { ch = ch << 1; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { ch = (ch << 1) | 1; latMin = mid; } else { ch = ch << 1; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) { hash += BASE32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

const iso = (days: number) =>
  new Date(Date.now() - days * 86400000).toISOString();

let reports: Report[] = [
  {
    id: "rpt-0001",
    title: "Groped near Rajiv Chowk exit",
    description: "A man grabbed me near the Rajiv Chowk metro exit around 9 pm. He disappeared into the crowd when I screamed.",
    category: "harassment",
    severity: 4,
    latitude: 28.6328,
    longitude: 77.2197,
    image_url: null,
    is_spam: false,
    status: "community-corroborated",
    user_id: "test-user-001",
    created_at: iso(2),
    corroborations: 6,
  },
  {
    id: "rpt-0002",
    title: "Chain snatcher on bikes in Karol Bagh",
    description: "Two men on a bike snatched a woman's chain near Ajmal Khan Road in broad daylight.",
    category: "theft",
    severity: 4,
    latitude: 28.6519,
    longitude: 77.1909,
    image_url: null,
    is_spam: false,
    status: "unverified",
    user_id: "test-user-001",
    created_at: iso(4),
    corroborations: 1,
  },
  {
    id: "rpt-0003",
    title: "Dark stretch at Hauz Khas Village side lane",
    description: "The lane connecting Hauz Khas village to the lake is completely dark after 10 pm. Multiple streetlights are broken.",
    category: "dark-alley",
    severity: 3,
    latitude: 28.5494,
    longitude: 77.2001,
    image_url: null,
    is_spam: false,
    status: "unverified",
    user_id: "seed-user-1",
    created_at: iso(1),
    corroborations: 0,
  },
];

let contacts: TrustedContact[] = [
  {
    id: "ctc-0001",
    user_id: "test-user-001",
    name: "Meera Sharma",
    phone: "+91 98100 12345",
    email: "meera.sharma@example.com",
    relation: "friend",
    created_at: iso(20),
  },
  {
    id: "ctc-0002",
    user_id: "test-user-001",
    name: "Rohit Kapoor",
    phone: "+91 98765 43210",
    email: "rohit.kapoor@example.com",
    relation: "family",
    created_at: iso(20),
  },
];

let sosEvents: SosEvent[] = [];
let alerts: Alert[] = [];

let riskCells: RiskScore[] = [
  { geohash: geohashEncode(28.6328, 77.2197), historical_score: 3.6, live_score: 3.2, combined_score: 3.4, last_updated: iso(0), latitude: 28.6328, longitude: 77.2197 },
  { geohash: geohashEncode(28.6519, 77.1909), historical_score: 3.4, live_score: 3.0, combined_score: 3.2, last_updated: iso(0), latitude: 28.6519, longitude: 77.1909 },
  { geohash: geohashEncode(28.5921, 77.046), historical_score: 3.3, live_score: 2.9, combined_score: 3.1, last_updated: iso(0), latitude: 28.5921, longitude: 77.046 },
];

const places: NearbyPlace[] = [
  { id: "pl-1", name: "Connaught Place PS", type: "police", latitude: 28.6295, longitude: 77.2145, phone: "011 2341 7650" },
  { id: "pl-2", name: "Tughlak Road PS", type: "police", latitude: 28.5998, longitude: 77.2138, phone: "011 2301 2937" },
  { id: "pl-3", name: "Hauz Khas PS", type: "police", latitude: 28.5487, longitude: 77.1988, phone: "011 2686 5409" },
  { id: "hs-1", name: "AIIMS Delhi", type: "hospital", latitude: 28.5672, longitude: 77.21, phone: "011 2658 8500" },
  { id: "hs-2", name: "Safdarjung Hospital", type: "hospital", latitude: 28.5679, longitude: 77.2041, phone: "011 2670 7400" },
  { id: "hs-3", name: "RML Hospital", type: "hospital", latitude: 28.6267, longitude: 77.2255, phone: "011 2336 5525" },
];

/* ---------------- reports ---------------- */

export function listReports(): Report[] {
  return [...reports].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function findReport(id: string): Report | undefined {
  return reports.find((r) => r.id === id);
}

export function insertReport(input: {
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  image_url: string | null;
  user_id: string;
}): Report {
  // Fixed rule: never block on AI — save with defaults, refine afterwards.
  const analysis = analyzeHeuristic(input.description);
  const report: Report = {
    id: `rpt-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    title: input.title,
    description: input.description,
    category: analysis.category,
    severity: analysis.severity,
    latitude: input.latitude,
    longitude: input.longitude,
    image_url: input.image_url ?? null,
    is_spam: analysis.is_spam,
    status: "unverified",
    user_id: input.user_id ?? "test-user-001",
    created_at: new Date().toISOString(),
    corroborations: 0,
  };
  reports.push(report);
  recomputeRisk();
  return report;
}

export function patchReport(id: string, patch: Partial<Report>): Report | undefined {
  const idx = reports.findIndex((r) => r.id === id);
  if (idx === -1) return undefined;
  reports[idx] = { ...reports[idx]!, ...patch };
  recomputeRisk();
  return reports[idx];
}

export function corroborate(id: string): Report | undefined {
  const r = findReport(id);
  if (!r) return undefined;
  return patchReport(id, {
    corroborations: r.corroborations + 1,
    status: r.corroborations + 1 >= 2 ? "community-corroborated" : r.status,
  });
}

/* ---------------- risk ---------------- */

export function recomputeRisk(): RiskScore[] {
  const cells = new Map<string, { sum: number; n: number; lat: number; lng: number }>();
  for (const r of reports) {
    if (r.is_spam) continue;
    const hash = geohashEncode(r.latitude, r.longitude);
    const cell = cells.get(hash) ?? { sum: 0, n: 0, lat: r.latitude, lng: r.longitude };
    cell.sum += r.severity;
    cell.n += 1;
    cells.set(hash, cell);
  }
  const scores: RiskScore[] = [];
  for (const [hash, cell] of cells) {
    const avg = cell.sum / cell.n;
    scores.push({
      geohash: hash,
      historical_score: round1(avg),
      live_score: round1(avg),
      combined_score: round1(avg),
      last_updated: new Date().toISOString(),
      latitude: cell.lat,
      longitude: cell.lng,
    });
  }
  const seen = new Set(scores.map((s) => s.geohash));
  for (const base of riskCells) {
    if (!seen.has(base.geohash)) scores.push(base);
  }
  return scores.sort((a, b) => b.combined_score - a.combined_score);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/* ---------------- contacts ---------------- */

export function listContacts(userId?: string): TrustedContact[] {
  return contacts.filter((c) => !userId || c.user_id === userId);
}

export function insertContact(input: Omit<TrustedContact, "id" | "created_at">): TrustedContact {
  const contact: TrustedContact = {
    ...input,
    id: `ctc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    created_at: new Date().toISOString(),
  };
  contacts.push(contact);
  return contact;
}

export function updateContact(id: string, patch: Partial<TrustedContact>): TrustedContact | undefined {
  const idx = contacts.findIndex((c) => c.id === id);
  if (idx === -1) return undefined;
  contacts[idx] = { ...contacts[idx]!, ...patch };
  return contacts[idx];
}

export function deleteContact(id: string): boolean {
  const before = contacts.length;
  contacts = contacts.filter((c) => c.id !== id);
  return contacts.length < before;
}

/* ---------------- SOS ---------------- */

export function triggerSos(location: { lat: number; lng: number }, userId: string) {
  const now = new Date();
  const event: SosEvent = {
    id: `sos-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    user_id: userId ?? "test-user-001",
    latitude: location.lat,
    longitude: location.lng,
    status: "active",
    created_at: now.toISOString(),
    resolved_at: null,
  };
  const createdAlerts: Alert[] = contacts
    .filter((c) => c.user_id === event.user_id)
    .map((c) => ({
      id: `al-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      contact_id: c.id,
      contact_name: c.name,
      contact_email: c.email,
      kind: "email",
      channel: c.email,
      message: `[SafeHer SOS] ${c.name}, I activated my panic alarm. Last known location: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}. Please call me or 112.`,
      sent_at: now.toISOString(),
    }));
  sosEvents.push(event);
  alerts.push(...createdAlerts);
  return { event, alerts: createdAlerts };
}

export function resolveSos(id: string): SosEvent | undefined {
  const idx = sosEvents.findIndex((e) => e.id === id);
  if (idx === -1) return undefined;
  sosEvents[idx] = { ...sosEvents[idx]!, status: "resolved", resolved_at: new Date().toISOString() };
  return sosEvents[idx];
}

export function listSosEvents(): SosEvent[] {
  return [...sosEvents].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function listAlerts(): Alert[] {
  return [...alerts].sort(
    (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
  );
}

/* ---------------- places ---------------- */

export function listPlaces(type?: "police" | "hospital"): NearbyPlace[] {
  return type ? places.filter((p) => p.type === type) : places;
}

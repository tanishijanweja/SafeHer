import { analyzeHeuristic, analyzeReport } from "./ai";
import {
  buildSeedContacts,
  buildSeedPlaces,
  buildSeedReports,
  buildSeedRiskScores,
} from "./delhi-data";
import { geohashEncode, haversineKm } from "./geo";
import type {
  Alert,
  GeoPoint,
  NearbyPlace,
  PlaceType,
  Report,
  ReportStatus,
  RiskScore,
  SosEvent,
  TrustedContact,
} from "./types";

/**
 * DATA MODE
 * ---------
 * Phase 1 (current): "local" — the app runs fully standalone against a fake
 * dataset (localStorage), so Person A never blocks on the shared database.
 *
 * Phase 2 (swap): once Person C shares access to the real shared database, the
 * web app can call the Hono API (apps/server) which mirrors these exact
 * functions. Each function below has a matching endpoint:
 *
 *   getReports          → GET    /api/reports
 *   getReport           → GET    /api/reports/:id
 *   createReport        → POST   /api/reports
 *   corroborateReport   → POST   /api/reports/:id/corroborate
 *   toggleSpam/setStatus→ PATCH  /api/reports/:id
 *   computeRiskScores   → GET    /api/risk
 *   getContacts         → GET    /api/contacts
 *   add/update/remove   → POST/PATCH/DELETE /api/contacts...
 *   getNearbyPlaces     → GET    /api/places
 *   triggerSos/resolve  → POST   /api/sos ... /api/sos/:id/resolve
 *   getSosEvents/alerts → GET    /api/sos/events | /api/sos/alerts
 *
 * The swap is a small, contained change (replace function bodies with fetch()).
 */

const LS_KEY = "safeher-store-v1";

interface PersistedData {
  reports: Report[];
  contacts: TrustedContact[];
  sosEvents: SosEvent[];
  alerts: Alert[];
}

function loadPersisted(): PersistedData {
  if (typeof window === "undefined") {
    return { reports: [], contacts: [], sosEvents: [], alerts: [] };
  }
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedData>;
      return {
        reports: parsed.reports ?? [],
        contacts: parsed.contacts ?? [],
        sosEvents: parsed.sosEvents ?? [],
        alerts: parsed.alerts ?? [],
      };
    }
  } catch {
    // corrupted storage — reseed below
  }
  return { reports: [], contacts: [], sosEvents: [], alerts: [] };
}

let data: PersistedData = loadPersisted();
let seedCells = buildSeedRiskScores();
let places = buildSeedPlaces();
let version = 0;

const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    // storage full — keep running in memory only
  }
}

function commit() {
  version += 1;
  persist();
  listeners.forEach((l) => l());
}

export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoreVersion(): number {
  return version;
}

/** Seed the fake dataset on first visit so the app demos immediately. */
export function ensureSeeded() {
  if (data.reports.length === 0) {
    data = {
      reports: buildSeedReports(),
      contacts: buildSeedContacts(),
      sosEvents: [],
      alerts: [],
    };
    seedCells = buildSeedRiskScores();
    persist();
  }
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export function getReports(): Report[] {
  return [...data.reports].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function getReport(id: string): Report | undefined {
  return data.reports.find((r) => r.id === id);
}

export interface CreateReportInput {
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  image_url: string | null;
  user_id: string;
}

export async function createReport(input: CreateReportInput): Promise<Report> {
  const id = `rpt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // Fixed rule: the report ALWAYS saves, even if AI fails — with sensible
  // defaults. The AI pass then refines it in place (severity, spam, category).
  const quick = analyzeHeuristic(input.description);
  const draft: Report = {
    id,
    title: input.title,
    description: input.description,
    category: quick.category,
    severity: quick.severity,
    latitude: input.latitude,
    longitude: input.longitude,
    image_url: input.image_url,
    is_spam: quick.is_spam,
    status: "unverified",
    user_id: input.user_id,
    created_at: new Date().toISOString(),
    corroborations: 0,
  };
  data.reports.push(draft);
  commit();

  const analysis = await analyzeReport(input.description);
  const final: Report = {
    ...draft,
    severity: analysis.severity,
    is_spam: analysis.is_spam,
    status: analysis.status,
    category: analysis.category,
  };
  data.reports = data.reports.map((r) => (r.id === id ? final : r));
  commit();
  return final;
}

export function updateReport(id: string, patch: Partial<Report>): Report | undefined {
  const report = data.reports.find((r) => r.id === id);
  if (!report) return undefined;
  const next = { ...report, ...patch };
  data.reports = data.reports.map((r) => (r.id === id ? next : r));
  commit();
  return next;
}

export function corroborateReport(id: string): Report | undefined {
  const report = data.reports.find((r) => r.id === id);
  if (!report) return undefined;
  return updateReport(id, {
    corroborations: report.corroborations + 1,
    status: report.corroborations + 1 >= 2 ? "community-corroborated" : report.status,
  });
}

export function toggleSpam(id: string): Report | undefined {
  const report = data.reports.find((r) => r.id === id);
  if (!report) return undefined;
  return updateReport(id, { is_spam: !report.is_spam });
}

export function setReportStatus(id: string, status: ReportStatus): Report | undefined {
  return updateReport(id, { status });
}

/* ------------------------------------------------------------------ */
/* Risk scores                                                         */
/* ------------------------------------------------------------------ */

export function computeRiskScores(): RiskScore[] {
  const cells = new Map<
    string,
    { severities: number[]; weights: number[]; lat: number; lng: number; last: number }
  >();

  const now = Date.now();
  for (const r of data.reports) {
    if (r.is_spam) continue;
    const hash = geohashEncode(r.latitude, r.longitude, 6);
    let cell = cells.get(hash);
    if (!cell) {
      cell = { severities: [], weights: [], lat: r.latitude, lng: r.longitude, last: 0 };
      cells.set(hash, cell);
    }
    const ageDays = (now - new Date(r.created_at).getTime()) / 86400000;
    const recency = Math.max(0.15, 1 - ageDays / 60);
    cell.severities.push(r.severity);
    cell.weights.push(recency * (r.corroborations + 1));
    cell.last = Math.max(cell.last, new Date(r.created_at).getTime());
  }

  const scores: RiskScore[] = [];

  for (const [hash, cell] of cells) {
    const wSum = cell.weights.reduce((a, b) => a + b, 0) || 1;
    const historical = cell.severities.reduce((a, s) => a + s, 0) / cell.severities.length;
    const live = cell.severities.reduce((a, s, i) => a + s * cell.weights[i], 0) / wSum;
    scores.push({
      geohash: hash,
      historical_score: round1(historical),
      live_score: round1(live),
      combined_score: round1(0.5 * historical + 0.5 * live),
      last_updated: new Date(Math.max(cell.last, now - 86400000)).toISOString(),
      latitude: cell.lat,
      longitude: cell.lng,
    });
  }

  // Merge baseline cells so the whole map is coloured, not just report cells.
  for (const base of seedCells) {
    if (cells.has(base.geohash)) continue;
    scores.push(base);
  }

  return scores.sort((a, b) => b.combined_score - a.combined_score);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Trusted contacts                                                    */
/* ------------------------------------------------------------------ */

export function getContacts(): TrustedContact[] {
  return [...data.contacts];
}

export interface ContactInput {
  name: string;
  phone: string;
  email: string;
  relation: TrustedContact["relation"];
  user_id: string;
}

export function addContact(input: ContactInput): TrustedContact {
  const contact: TrustedContact = {
    id: `ctc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    user_id: input.user_id,
    name: input.name,
    phone: input.phone,
    email: input.email,
    relation: input.relation,
    created_at: new Date().toISOString(),
  };
  data.contacts.push(contact);
  commit();
  return contact;
}

export function updateContact(id: string, patch: Partial<TrustedContact>): TrustedContact | undefined {
  const contact = data.contacts.find((c) => c.id === id);
  if (!contact) return undefined;
  const next = { ...contact, ...patch };
  data.contacts = data.contacts.map((c) => (c.id === id ? next : c));
  commit();
  return next;
}

export function removeContact(id: string) {
  data.contacts = data.contacts.filter((c) => c.id !== id);
  commit();
}

export function sendTestAlert(contactId: string): Alert | undefined {
  const contact = data.contacts.find((c) => c.id === contactId);
  if (!contact) return undefined;
  const alert: Alert = {
    id: `al-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    contact_id: contact.id,
    contact_name: contact.name,
    contact_email: contact.email,
    kind: "email",
    channel: contact.email,
    message: `[SafeHer test] Hi ${contact.name}, this is a test alert to make sure you receive SafeHer emergency notifications. No action needed.`,
    sent_at: new Date().toISOString(),
  };
  data.alerts.push(alert);
  commit();
  return alert;
}

/* ------------------------------------------------------------------ */
/* Nearby emergency services                                           */
/* ------------------------------------------------------------------ */

export function getNearbyPlaces(): NearbyPlace[] {
  return [...places];
}

export function nearbyByType(
  origin: GeoPoint,
  type: PlaceType,
  max = 6,
): (NearbyPlace & { distanceKm: number })[] {
  return places
    .filter((p) => p.type === type)
    .map((p) => ({
      ...p,
      distanceKm: haversineKm({ lat: p.latitude, lng: p.longitude }, origin),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, max);
}

/* ------------------------------------------------------------------ */
/* SOS                                                                 */
/* ------------------------------------------------------------------ */

export interface TriggerSosResult {
  event: SosEvent;
  alerts: Alert[];
}

export function triggerSos(location: GeoPoint): TriggerSosResult {
  const id = `sos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date();
  const event: SosEvent = {
    id,
    user_id: "test-user-001",
    latitude: location.lat,
    longitude: location.lng,
    status: "active",
    created_at: now.toISOString(),
    resolved_at: null,
  };

  const alerts: Alert[] = data.contacts.map((c) => ({
    id: `al-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    contact_id: c.id,
    contact_name: c.name,
    contact_email: c.email,
    kind: "email",
    channel: c.email,
    message: `[SafeHer SOS] ${c.name}, I activated my panic alarm. My last known location: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}. Please call me or the local police (112) right now.`,
    sent_at: now.toISOString(),
  }));

  data.sosEvents.push(event);
  data.alerts.push(...alerts);
  commit();

  // A live SOS instantly bumps the risk score of the surrounding area.
  const hash = geohashEncode(location.lat, location.lng, 6);
  const existing = seedCells.find((s) => s.geohash === hash);
  if (existing) {
    existing.live_score = round1(Math.min(5, existing.live_score + 1));
    existing.combined_score = round1(
      0.5 * existing.historical_score + 0.5 * existing.live_score,
    );
    existing.last_updated = now.toISOString();
  } else {
    seedCells.push({
      geohash: hash,
      historical_score: 2,
      live_score: 4,
      combined_score: 3,
      last_updated: now.toISOString(),
      latitude: location.lat,
      longitude: location.lng,
    });
  }
  commit();

  return { event, alerts };
}

export function resolveSos(id: string): SosEvent | undefined {
  const event = data.sosEvents.find((e) => e.id === id);
  if (!event) return undefined;
  const next: SosEvent = { ...event, status: "resolved", resolved_at: new Date().toISOString() };
  data.sosEvents = data.sosEvents.map((e) => (e.id === id ? next : e));
  commit();
  return next;
}

export function getSosEvents(): SosEvent[] {
  return [...data.sosEvents].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function getAlerts(): Alert[] {
  return [...data.alerts].sort(
    (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
  );
}

/* ------------------------------------------------------------------ */
/* Demo helpers                                                        */
/* ------------------------------------------------------------------ */

export function getStats() {
  const reports = getReports();
  const nonSpam = reports.filter((r) => !r.is_spam);
  const corroborated = reports.filter((r) => r.status === "community-corroborated");
  const active = getSosEvents().filter((e) => e.status === "active").length;
  const avgSeverity =
    nonSpam.length === 0 ? 0 : nonSpam.reduce((a, r) => a + r.severity, 0) / nonSpam.length;
  return {
    reports: reports.length,
    corroborated: corroborated.length,
    avgSeverity: Math.round(avgSeverity * 10) / 10,
    activeSos: active,
    hotspots: computeRiskScores().filter((r) => r.combined_score >= 3).length,
  };
}

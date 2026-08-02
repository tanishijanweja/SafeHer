/**
 * Server-side copy of the shared data shape every SafeHer teammate builds
 * against (Report / RiskScore / contacts / SOS). These match the exact
 * structure defined in the plan, so the web app can swap its local store for
 * these endpoints with a single-line change per function.
 */

export type ReportStatus = "unverified" | "community-corroborated";

export type ReportCategory =
  | "harassment"
  | "theft"
  | "assault"
  | "poor-lighting"
  | "dark-alley"
  | "unsafe-transit"
  | "stalking"
  | "unsafe-area"
  | "other";

export interface Report {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  severity: number;
  latitude: number;
  longitude: number;
  image_url: string | null;
  is_spam: boolean;
  status: ReportStatus;
  user_id: string;
  created_at: string;
  corroborations: number;
}

export interface RiskScore {
  geohash: string;
  historical_score: number;
  live_score: number;
  combined_score: number;
  last_updated: string;
  latitude: number;
  longitude: number;
}

export type ContactRelation = "family" | "friend" | "guardian" | "partner" | "other";

export interface TrustedContact {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  email: string;
  relation: ContactRelation;
  created_at: string;
}

export interface SosEvent {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  status: "active" | "resolved" | "cancelled";
  created_at: string;
  resolved_at: string | null;
}

export interface Alert {
  id: string;
  contact_id: string;
  contact_name: string;
  contact_email: string;
  kind: "email" | "in-app";
  channel: string;
  message: string;
  sent_at: string;
}

export type PlaceType = "police" | "hospital";

export interface NearbyPlace {
  id: string;
  name: string;
  type: PlaceType;
  latitude: number;
  longitude: number;
  phone: string;
}

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

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Shared data shape — every report in SafeHer matches this exactly. */
export interface Report {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  /** 1 to 5, where 5 = most severe */
  severity: number;
  latitude: number;
  longitude: number;
  image_url: string | null;
  is_spam: boolean;
  status: ReportStatus;
  user_id: string;
  created_at: string;
  /** number of users who corroborated this report */
  corroborations: number;
}

/** Shared data shape — risk is computed per geohash cell (precision 6). */
export interface RiskScore {
  geohash: string;
  historical_score: number;
  live_score: number;
  combined_score: number;
  last_updated: string;
  /** approximate center of the cell, for map rendering */
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

export const REPORT_CATEGORIES: {
  value: ReportCategory;
  label: string;
  icon: string;
}[] = [
  { value: "harassment", label: "Harassment", icon: "megaphone" },
  { value: "theft", label: "Theft / Robbery", icon: "wallet" },
  { value: "assault", label: "Assault", icon: "shield-alert" },
  { value: "poor-lighting", label: "Poor Lighting", icon: "lightbulb-off" },
  { value: "dark-alley", label: "Dark Alley / Isolated Spot", icon: "map-pin-x" },
  { value: "unsafe-transit", label: "Unsafe Transit", icon: "bus" },
  { value: "stalking", label: "Stalking / Following", icon: "eye-off" },
  { value: "unsafe-area", label: "Unsafe Area (general)", icon: "alert-triangle" },
  { value: "other", label: "Other", icon: "ellipsis" },
];

export function categoryLabel(value: ReportCategory): string {
  return REPORT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export const SEVERITY_LABELS: Record<number, string> = {
  1: "Low risk",
  2: "Mild",
  3: "Moderate",
  4: "High",
  5: "Critical",
};

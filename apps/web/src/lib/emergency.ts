export type EmergencyType = "helpline" | "police" | "hospital" | "fire";

export type EmergencyService = {
  id: string;
  name: string;
  type: EmergencyType;
  /** Distance in kilometres from the user's location. */
  distanceKm: number | null;
  distanceLabel: string;
  phone?: string;
  address?: string;
  /** Coordinates, present for location-based services (null for helplines). */
  lat?: number;
  lng?: number;
};


export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function distanceLabel(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** National / state emergency & women-and-child safety helplines (India). */
export function getHelplines(): EmergencyService[] {
  const list: Array<Omit<EmergencyService, "distanceKm" | "distanceLabel">> = [
    { id: "helpline-112", name: "National Emergency", type: "helpline", phone: "112" },
    { id: "helpline-100", name: "Police (Emergency)", type: "helpline", phone: "100" },
    { id: "helpline-1091", name: "Women Helpline", type: "helpline", phone: "1091" },
    { id: "helpline-1098", name: "Child Helpline (Childline)", type: "helpline", phone: "1098" },
    { id: "helpline-109", name: "Domestic Violence Helpline", type: "helpline", phone: "109" },
    { id: "helpline-women-safety", name: "Women / Girls Safety (24x7)", type: "helpline", phone: "112" },
  ];
  return list.map((h) => ({
    ...h,
    distanceKm: null,
    distanceLabel: "Always available",
  }));
}

type StaticService = Omit<
  EmergencyService,
  "id" | "distanceKm" | "distanceLabel"
> & {
  lat: number;
  lng: number;
};

/**
 * Known Delhi locations used as reliable fallbacks when the live map data for a
 * category comes back empty (e.g. sparse OSM coverage around a spot).
 */
const DELHI_POLICE: StaticService[] = [
  { name: "Connaught Place Police Station", type: "police", lat: 28.6304, lng: 77.2177, phone: "011-2349-0534", address: "Baba Kharak Singh Marg, Connaught Place" },
  { name: "Hauz Khas Police Station", type: "police", lat: 28.549, lng: 77.2053, phone: "011-2692-4901", address: "Hauz Khas Village" },
  { name: "Lajpat Nagar Police Station", type: "police", lat: 28.5665, lng: 77.2434, phone: "011-2981-2900", address: "Lajpat Nagar II" },
  { name: "Saket Police Station", type: "police", lat: 28.5246, lng: 77.2126, phone: "011-2956-8100", address: "Saket District Centre" },
  { name: "Greater Kailash Police Station", type: "police", lat: 28.5335, lng: 77.2076, phone: "011-2643-8100", address: "G K 1" },
  { name: "Rohini North Police Station", type: "police", lat: 28.734, lng: 77.075, phone: "011-2786-6401", address: "Rohini District Centre" },
  { name: "Dwarka South Police Station", type: "police", lat: 28.597, lng: 77.048, phone: "011-2505-5100", address: "Sector 12, Dwarka" },
  { name: "Karol Bagh Police Station", type: "police", lat: 28.6536, lng: 77.19, phone: "011-2361-6770", address: "Karol Bagh" },
  { name: "Paharganj Police Station", type: "police", lat: 28.642, lng: 77.2126, phone: "011-2351-6417", address: "Main Bazar, Paharganj" },
  { name: "Shahdara Police Station", type: "police", lat: 28.69, lng: 77.291, phone: "011-2231-1900", address: "Shahdara" },
];

const FALLBACK_HOSPITAL: StaticService[] = [
  { name: "AIIMS New Delhi", type: "hospital", lat: 28.5672, lng: 77.21, phone: "011-2658-8500", address: "Ansari Nagar, AIIMS" },
  { name: "Safdarjung Hospital", type: "hospital", lat: 28.5687, lng: 77.1962, phone: "011-2670-7100", address: "Safdarjung Marg" },
  { name: "RML Hospital", type: "hospital", lat: 28.6289, lng: 77.196, phone: "011-2371-2373", address: "Baba Kharak Singh Marg" },
  { name: "Lady Hardinge Medical College", type: "hospital", lat: 28.6345, lng: 77.2207, phone: "011-2340-1999", address: "Shaheed Bhagat Singh Marg" },
  { name: "Apollo Hospital", type: "hospital", lat: 28.562, lng: 77.1849, phone: "011-2690-0101", address: "Sarita Vihar" },
];

const FALLBACK_FIRE: StaticService[] = [
  { name: "Delhi Fire Service HQ", type: "fire", lat: 28.6321, lng: 77.2363, phone: "101", address: "Barakhamba Road" },
  { name: "Fire Station Connaught Place", type: "fire", lat: 28.6304, lng: 77.2177, phone: "101", address: "Connaught Place" },
  { name: "Fire Station Lajpat Nagar", type: "fire", lat: 28.5665, lng: 77.2434, phone: "101", address: "Lajpat Nagar" },
  { name: "Fire Station Rohini", type: "fire", lat: 28.7205, lng: 77.0933, phone: "101", address: "Sector 8, Rohini" },
];

type OverpassElement = {
  type: "node" | "way";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const TYPE_BY_TAG: Record<string, EmergencyType> = {
  police: "police",
  hospital: "hospital",
  fire_station: "fire",
};

/**
 * Fetches nearby police stations, hospitals and fire stations around a
 * location using the free OpenStreetMap Overpass API. Falls back to a curated
 * Delhi list per category when the live data is thin, and always returns the
 * standard helplines on top.
 */
export async function fetchNearbyServices(
  lat: number,
  lng: number,
): Promise<EmergencyService[]> {
  const services: EmergencyService[] = [];

  // Load the full real Delhi dataset (177 police, 842 hospitals, 22 fire)
  // at runtime via fetch — safer than bundling it as code, and fails
  // quietly (just returns empty) instead of breaking the build if anything
  // goes wrong.
  try {
    const res = await fetch("/delhi-safety-data.json");
    if (res.ok) {
      const fullData = await res.json();
      for (const category of ["police", "hospital", "fire"] as const) {
        for (const item of fullData[category] || []) {
          const distance = haversineKm(lat, lng, item.lat, item.lng);
          services.push({
            id: `${category}-full-${item.name.replace(/\s+/g, "-")}`,
            name: item.name,
            type: category,
            distanceKm: distance,
            distanceLabel: distanceLabel(distance),
            phone: item.phone,
            address: item.address,
            lat: item.lat,
            lng: item.lng,
          });
        }
      }
    }
  } catch {
    // Fails quietly — Overpass live fetch and the small curated fallback
    // list below still work fine even if this doesn't load.
  }

  try {
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"~"^(police|hospital|fire_station)$"](around:12000,${lat},${lng});
        way["amenity"~"^(police|hospital|fire_station)$"](around:12000,${lat},${lng});
      );
      out center;
    `;

    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (res.ok) {
      const json = (await res.json()) as { elements?: OverpassElement[] };
      for (const el of json.elements ?? []) {
        const tags = el.tags ?? {};
        const amenity = amenityFromTags(tags);
        if (!amenity) continue;
        const elLat = el.lat ?? el.center?.lat;
        const elLng = el.lon ?? el.center?.lon;
        if (elLat === undefined || elLng === undefined) continue;
        const distance = haversineKm(lat, lng, elLat, elLng);
        services.push({
          id: `${el.type}-${el.id}`,
          name: tags.name ?? defaultNameFor(amenity),
          type: amenity,
          distanceKm: distance,
          distanceLabel: distanceLabel(distance),
          phone: pickPhone(tags),
          address: tags["addr:street"]
            ? [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ")
            : undefined,
          lat: elLat,
          lng: elLng,
        });
      }
    }
  } catch {
    // Overpass may be unreachable — fall back to the curated lists below.
  }

  const enriched = [...services, ...fallbacksFor(lat, lng, services)]
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

  return [...getHelplines(), ...enriched];
}

/** Minimum number of each location-based service we guarantee to return. */
const MIN_PER_CATEGORY = 2;

/** Add curated Delhi services for any category with fewer than 2 entries. */
function fallbacksFor(
  lat: number,
  lng: number,
  existing: EmergencyService[],
): EmergencyService[] {
  const count = (type: EmergencyType) =>
    existing.filter((s) => s.type === type).length;
  const out: EmergencyService[] = [];

  const fillUp = (type: EmergencyType, list: StaticService[]) => {
    let need = MIN_PER_CATEGORY - count(type);
    for (const p of list) {
      if (need <= 0) break;
      need -= 1;
      const distance = haversineKm(lat, lng, p.lat, p.lng);
      out.push({
        id: `${type}-fallback-${p.name.replace(/\s+/g, "-")}`,
        name: p.name,
        type,
        distanceKm: distance,
        distanceLabel: distanceLabel(distance),
        phone: p.phone,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
      });
    }
  };

  fillUp("police", DELHI_POLICE);
  fillUp("hospital", FALLBACK_HOSPITAL);
  fillUp("fire", FALLBACK_FIRE);
  return out;
}

function amenityFromTags(tags: Record<string, string>): EmergencyType | null {
  const amenity = tags["amenity"];
  if (amenity === "police" || amenity === "hospital" || amenity === "fire_station") {
    return TYPE_BY_TAG[amenity];
  }
  return null;
}

function pickPhone(tags: Record<string, string>): string | undefined {
  return (
    tags["contact:phone"] ??
    tags["phone"] ??
    tags["phone:mobile"] ??
    tags["contact:mobile"]
  );
}

function defaultNameFor(type: EmergencyType): string {
  switch (type) {
    case "police":
      return "Police Station";
    case "hospital":
      return "Hospital";
    case "fire":
      return "Fire Station";
    default:
      return "Emergency Service";
  }
}
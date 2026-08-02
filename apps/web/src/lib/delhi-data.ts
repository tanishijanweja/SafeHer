import type { NearbyPlace, Report, RiskScore, TrustedContact } from "./types";

const daysAgo = (days: number, hours = 0) =>
  new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();

interface SeedReport {
  title: string;
  description: string;
  category: Report["category"];
  severity: number;
  lat: number;
  lng: number;
  status: Report["status"];
  is_spam?: boolean;
  corroborations?: number;
  days: number;
  hours?: number;
}

export function buildSeedReports(): Report[] {
  const raw: SeedReport[] = [
    {
      title: "Groped near Rajiv Chowk exit",
      description:
        "A man grabbed me near the Rajiv Chowk metro exit around 9 pm. He disappeared into the crowd when I screamed. Poor lighting and no security guard at the exit.",
      category: "harassment",
      severity: 4,
      lat: 28.6328,
      lng: 77.2197,
      status: "community-corroborated",
      corroborations: 6,
      days: 2,
      hours: 3,
    },
    {
      title: "Chain snatcher on bikes in Karol Bagh",
      description:
        "Two men on a bike snatched a woman's chain near Ajmal Khan Road in broad daylight. They did the same thing the next street over minutes later.",
      category: "theft",
      severity: 4,
      lat: 28.6519,
      lng: 77.1909,
      status: "community-corroborated",
      corroborations: 4,
      days: 4,
    },
    {
      title: "Dark stretch at Hauz Khas Village side lane",
      description:
        "The lane connecting Hauz Khas village to the lake is completely dark after 10 pm. Multiple streetlights are broken. I was followed for a few steps here.",
      category: "dark-alley",
      severity: 3,
      lat: 28.5494,
      lng: 77.2001,
      status: "unverified",
      days: 1,
    },
    {
      title: "Man followed me from Saket metro till my gate",
      description:
        "Someone on a scooter followed me from Saket metro station all the way to my apartment in Chhatarpur. He waited outside until I called someone to walk me in.",
      category: "stalking",
      severity: 4,
      lat: 28.5228,
      lng: 77.2066,
      status: "community-corroborated",
      corroborations: 3,
      days: 5,
    },
    {
      title: "Dark underpass at Ring Road, Lajpat Nagar",
      description:
        "The pedestrian underpass near Lajpat Nagar metro is unlit and empty at night. A friend was pushed here. Avoid after 11 pm.",
      category: "unsafe-area",
      severity: 3,
      lat: 28.5662,
      lng: 77.243,
      status: "unverified",
      days: 7,
    },
    {
      title: "Eve teasing at Paharganj market",
      description:
        "Groups of men catcall and block the footpath near the Paharganj main market every evening. Very uncomfortable to walk through alone.",
      category: "harassment",
      severity: 3,
      lat: 28.6456,
      lng: 77.213,
      status: "unverified",
      days: 3,
    },
    {
      title: "Cable strung across footpath in Rohini",
      description:
        "A torn cable hangs across the footpath near Rohini Sector 7 market. In the dark it is invisible and could easily electrocute someone walking home late.",
      category: "poor-lighting",
      severity: 2,
      lat: 28.7345,
      lng: 77.0817,
      status: "unverified",
      days: 2,
    },
    {
      title: "Snatching near Uttam Nagar bus stop",
      description:
        "Phone snatched from a woman boarding a bus near Uttam Nagar East. The bus stop is overcrowded and there is no police presence after 8 pm.",
      category: "theft",
      severity: 3,
      lat: 28.6204,
      lng: 77.0598,
      status: "community-corroborated",
      corroborations: 2,
      days: 6,
    },
    {
      title: "Isolated stretch on Dwarka footpath",
      description:
        "The footpath along Dwarka Sector 9 is completely isolated at night. Streetlights keep failing. A woman was assaulted here last week, stay away.",
      category: "unsafe-area",
      severity: 4,
      lat: 28.5921,
      lng: 77.046,
      status: "community-corroborated",
      corroborations: 5,
      days: 9,
    },
    {
      title: "Man acting suspiciously near school, Vasant Kunj",
      description:
        "An unknown man on a motorcycle has been circling the school gate in Vasant Kunj Sector C during pick-up time. Teachers have started walking students out together.",
      category: "stalking",
      severity: 3,
      lat: 28.5233,
      lng: 77.1534,
      status: "unverified",
      days: 4,
      hours: 2,
    },
    {
      title: "Late night harassment at Nehru Place bus queue",
      description:
        "While waiting for a bus at Nehru Place around 11:30 pm, a man kept brushing against women in the queue. No cctv coverage on this side.",
      category: "harassment",
      severity: 3,
      lat: 28.5456,
      lng: 77.2513,
      status: "unverified",
      days: 1,
      hours: 5,
    },
    {
      title: "Unlit pathway near Jamia Nagar market",
      description:
        "The short cut between Jamia Nagar and Okhla near the water tank has no lights at all. I slipped and fell because the ground is uneven and dark.",
      category: "poor-lighting",
      severity: 2,
      lat: 28.5603,
      lng: 77.2848,
      status: "unverified",
      days: 3,
    },
    {
      title: "Eve teasing by group at Chandni Chowk gate",
      description:
        "A group of boys pass comments and try to block girls near the Chandni Chowk metro gate. Reported to the beat constable who said he would patrol more.",
      category: "harassment",
      severity: 3,
      lat: 28.6502,
      lng: 77.2298,
      status: "community-corroborated",
      corroborations: 2,
      days: 8,
    },
    {
      title: "Pushback and rude behaviour in Metro compartment",
      description:
        "A man pushed me inside the metro near the door and stood too close despite the compartment being empty. He got off at Mandi House.",
      category: "unsafe-transit",
      severity: 2,
      lat: 28.6244,
      lng: 77.2381,
      status: "unverified",
      days: 2,
      hours: 6,
    },
    {
      title: "Win a free smartphone, click here",
      description:
        "Congratulations you have won a free smartphone click here to claim your prize and enter your bank details.",
      category: "other",
      severity: 1,
      lat: 28.6129,
      lng: 77.2295,
      is_spam: true,
      status: "unverified",
      days: 0,
      hours: 2,
    },
    {
      title: "Crowded bus stop at Sarita Vihar underpass",
      description:
        "The underpass at Sarita Vihar is used by many women going to work early morning. It is dimly lit and a man was loitering around every day last week.",
      category: "dark-alley",
      severity: 3,
      lat: 28.534,
      lng: 77.2927,
      status: "unverified",
      days: 5,
    },
  ];

  return raw.map((r, i) => ({
    id: `rpt-${String(i + 1).padStart(4, "0")}`,
    title: r.title,
    description: r.description,
    category: r.category,
    severity: r.severity,
    latitude: r.lat,
    longitude: r.lng,
    image_url: null,
    is_spam: r.is_spam ?? false,
    status: r.status,
    user_id: i % 3 === 0 ? "test-user-001" : `seed-user-${(i % 2) + 1}`,
    created_at: daysAgo(r.days, r.hours),
    corroborations: r.corroborations ?? 0,
  }));
}

/** Baseline risk cells so the heatmap has colour even before any new report. */
export function buildSeedRiskScores(): RiskScore[] {
  const base: { lat: number; lng: number; score: number }[] = [
    { lat: 28.6328, lng: 77.2197, score: 3.6 },
    { lat: 28.6519, lng: 77.1909, score: 3.4 },
    { lat: 28.6456, lng: 77.213, score: 3.1 },
    { lat: 28.5494, lng: 77.2001, score: 2.9 },
    { lat: 28.5921, lng: 77.046, score: 3.3 },
    { lat: 28.6204, lng: 77.0598, score: 2.8 },
    { lat: 28.5228, lng: 77.2066, score: 3.0 },
    { lat: 28.5662, lng: 77.243, score: 2.7 },
    { lat: 28.6502, lng: 77.2298, score: 2.6 },
    { lat: 28.5391, lng: 77.2949, score: 2.5 },
    { lat: 28.6139, lng: 77.209, score: 2.2 },
    { lat: 28.6424, lng: 77.1198, score: 2.0 },
    { lat: 28.5603, lng: 77.2848, score: 2.1 },
  ];
  return base.map((b) => {
    const lat = Math.round(b.lat * 1e5) / 1e5;
    const lng = Math.round(b.lng * 1e5) / 1e5;
    return {
      geohash: `${lat.toFixed(5)}:${lng.toFixed(5)}`,
      historical_score: Math.round(b.score * 10) / 10,
      live_score: Math.round((b.score * 0.9 + 0.2) * 10) / 10,
      combined_score: Math.round(b.score * 10) / 10,
      last_updated: new Date(Date.now() - 12 * 3600000).toISOString(),
      latitude: lat,
      longitude: lng,
    };
  });
}

export function buildSeedContacts(): TrustedContact[] {
  return [
    {
      id: "ctc-0001",
      user_id: "test-user-001",
      name: "Meera Sharma",
      phone: "+91 98100 12345",
      email: "meera.sharma@example.com",
      relation: "friend",
      created_at: daysAgo(20),
    },
    {
      id: "ctc-0002",
      user_id: "test-user-001",
      name: "Rohit Kapoor",
      phone: "+91 98765 43210",
      email: "rohit.kapoor@example.com",
      relation: "family",
      created_at: daysAgo(20),
    },
    {
      id: "ctc-0003",
      user_id: "test-user-001",
      name: "Priya Nair",
      phone: "+91 98999 00011",
      email: "priya.nair@example.com",
      relation: "guardian",
      created_at: daysAgo(15),
    },
  ];
}

export function buildSeedPlaces(): NearbyPlace[] {
  const police: NearbyPlace[] = [
    { id: "pl-1", name: "Connaught Place PS", type: "police", latitude: 28.6295, longitude: 77.2145, phone: "011 2341 7650" },
    { id: "pl-2", name: "Tughlak Road PS", type: "police", latitude: 28.5998, longitude: 77.2138, phone: "011 2301 2937" },
    { id: "pl-3", name: "Karol Bagh PS", type: "police", latitude: 28.6466, longitude: 77.1916, phone: "011 2872 1887" },
    { id: "pl-4", name: "Hauz Khas PS", type: "police", latitude: 28.5487, longitude: 77.1988, phone: "011 2686 5409" },
    { id: "pl-5", name: "Defence Colony PS", type: "police", latitude: 28.5733, longitude: 77.2307, phone: "011 2461 6160" },
    { id: "pl-6", name: "Vasant Kunj North PS", type: "police", latitude: 28.5241, longitude: 77.1517, phone: "011 2613 2222" },
    { id: "pl-7", name: "Dwarka North PS", type: "police", latitude: 28.5989, longitude: 77.0296, phone: "011 2508 1234" },
    { id: "pl-8", name: "Rohini North PS", type: "police", latitude: 28.7452, longitude: 77.1261, phone: "011 2756 7657" },
    { id: "pl-9", name: "Lajpat Nagar PS", type: "police", latitude: 28.565, longitude: 77.2423, phone: "011 2981 1098" },
    { id: "pl-10", name: "Okhla PS", type: "police", latitude: 28.5397, longitude: 77.2985, phone: "011 2683 1436" },
    { id: "pl-11", name: "Sarai Rohilla PS", type: "police", latitude: 28.6536, longitude: 77.193, phone: "011 2871 7344" },
    { id: "pl-12", name: "Paharganj PS", type: "police", latitude: 28.6454, longitude: 77.2104, phone: "011 2356 4070" },
  ];
  const hospitals: NearbyPlace[] = [
    { id: "hs-1", name: "AIIMS Delhi", type: "hospital", latitude: 28.5672, longitude: 77.21, phone: "011 2658 8500" },
    { id: "hs-2", name: "Safdarjung Hospital", type: "hospital", latitude: 28.5679, longitude: 77.2041, phone: "011 2670 7400" },
    { id: "hs-3", name: "Lady Hardinge Medical College", type: "hospital", latitude: 28.6326, longitude: 77.2248, phone: "011 2340 8206" },
    { id: "hs-4", name: "RML Hospital", type: "hospital", latitude: 28.6267, longitude: 77.2255, phone: "011 2336 5525" },
    { id: "hs-5", name: "GTB Hospital", type: "hospital", latitude: 28.6507, longitude: 77.2947, phone: "011 2258 0303" },
    { id: "hs-6", name: "Fortis Vasant Kunj", type: "hospital", latitude: 28.5284, longitude: 77.1548, phone: "011 4277 6222" },
    { id: "hs-7", name: "Max Saket", type: "hospital", latitude: 28.528, longitude: 77.2173, phone: "011 2651 5050" },
    { id: "hs-8", name: "Holy Family Hospital", type: "hospital", latitude: 28.5615, longitude: 77.2881, phone: "011 2684 3700" },
    { id: "hs-9", name: "Apollo Indraprastha", type: "hospital", latitude: 28.5793, longitude: 77.2449, phone: "011 2987 1000" },
    { id: "hs-10", name: "Deen Dayal Hospital", type: "hospital", latitude: 28.6278, longitude: 77.2322, phone: "011 2323 6100" },
    { id: "hs-11", name: "DDU Nair Hospital", type: "hospital", latitude: 28.6539, longitude: 77.2133, phone: "011 2354 7234" },
  ];
  return [...police, ...hospitals];
}

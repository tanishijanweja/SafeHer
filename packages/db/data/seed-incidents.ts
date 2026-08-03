/**
 * Seed incidents — real, individually source-cited events, used to give the
 * LIVE layer (Layer B) initial hyperlocal texture before real user reports
 * or the automated news fetcher (news-incident-fetcher.ts) accumulate more.
 *
 * Every entry here is a real, reported event with a real citation.
 */

export type SeedIncident = {
  title: string;
  description: string;
  category:
    | "harassment"
    | "stalking"
    | "unsafe_transport"
    | "poor_lighting"
    | "other";
  severity: number;
  latitude: number;
  longitude: number;
  date: string;
  source: string;
};

export const SEED_INCIDENTS: SeedIncident[] = [
  {
    title: "Mandawali car harassment case",
    description:
      "A 24-year-old woman was allegedly sexually harassed and threatened by a man known to her inside a moving car in East Delhi's Mandawali area; she escaped by screaming and banging on the windows. An FIR was registered and the accused arrested.",
    category: "harassment",
    severity: 4,
    latitude: 28.6252562,
    longitude: 77.3063738,
    date: "2026-06-30",
    source: "India Today, June 2026 (Mandawali, East Delhi)",
  },
  {
    title: "Nehru Place assault case",
    description:
      "Two women were allegedly molested and assaulted by a group of men near Nehru Place in the early hours, renewing scrutiny of women's safety in the area.",
    category: "harassment",
    severity: 4,
    latitude: 28.5514376,
    longitude: 77.2524943,
    date: "2026-05-12",
    source: "Reported via news coverage, May 2026 (Nehru Place)",
  },
  {
    title: "Sultanpuri dragging case",
    description:
      "A woman was fatally dragged for kilometers under a car after being struck near Sultanpuri, drawing national attention to road and public safety gaps in outer Delhi.",
    category: "unsafe_transport",
    severity: 5,
    latitude: 28.7028222,
    longitude: 77.0789438,
    date: "2023-01-01",
    source:
      "Reported widely by national media, Jan 2023 (Sultanpuri, outer Delhi)",
  },
  {
    title: "Indraprastha College for Women fest harassment",
    description:
      "Unidentified men trespassed into an all-women's Delhi University college during its annual festival, harassing students; visuals of men climbing the campus wall circulated widely, prompting a Delhi Commission for Women inquiry.",
    category: "harassment",
    severity: 4,
    latitude: 28.6889,
    longitude: 77.2091,
    date: "2023-12-01",
    source:
      "Outlook India, Jan 2024 (Indraprastha College for Women, North Campus area)",
  },
  {
    title: "Miranda House campus fest harassment (2022)",
    description:
      "Reported harassment incidents during a college festival at another Delhi University women's college, cited by the DCW as part of a recurring pattern at campus events in the North Campus area.",
    category: "harassment",
    severity: 3,
    latitude: 28.6923,
    longitude: 77.2094,
    date: "2022-01-01",
    source: "Outlook India, cited via DCW inquiry, North Campus, Delhi",
  },
  {
    title: "Gargi College fest harassment (2020)",
    description:
      "A previous, widely-reported incident of mass harassment during a college festival at a Delhi University women's college.",
    category: "harassment",
    severity: 4,
    latitude: 28.5588,
    longitude: 77.2456,
    date: "2020-02-01",
    source: "Outlook India, cited via DCW inquiry, Siri Fort area, South Delhi",
  },
  {
    title: "2012 Nirbhaya case (historical landmark case)",
    description:
      "The widely known 2012 gang rape case that began near a bus stop and became a national turning point for discussions of women's safety on Delhi's public transport routes.",
    category: "unsafe_transport",
    severity: 5,
    latitude: 28.5514,
    longitude: 77.1698,
    date: "2012-12-16",
    source: "The Wire, 2026 (referencing Munirka bus stand area, South Delhi)",
  },
];

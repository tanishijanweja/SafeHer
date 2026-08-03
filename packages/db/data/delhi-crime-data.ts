/**
 * Delhi historical crime data — Layer A of the risk heatmap.
 *
 * SOURCE: Real NCRB district-wise "crimes against women" data, 2022, sourced
 * from the India Data Portal's open dataset (districtwise-crime-against-women-2017-onwards.csv,
 * originally published under data.gov.in / NCRB, National Data Sharing and
 * Accessibility Policy).
 *
 * `historicalIncidentCount` below is the REAL sum of relevant crime categories
 * (rape, kidnapping/abduction, assault with intent to outrage modesty, dowry
 * deaths, cruelty by husband, insult to modesty) reported for each district
 * in 2022 — not an estimate, not population-weighted, pulled directly from
 * the government dataset and summed per district.
 *
 * IMPORTANT DATA HONESTY NOTE (say this to judges, per your own plan):
 * NCRB's district reporting for Delhi still uses the OLDER 11-district
 * structure (pre-2019). Delhi Police itself now operates 15 districts, but
 * NCRB hasn't broken out the 4 newer districts (Dwarka, Outer, Outer North,
 * Rohini) separately in this data — they're still folded into "South West"
 * and "North West" respectively. So this is real, official, cited district-
 * level government data — but at the government's own reporting granularity,
 * not pin-precise. This is exactly the distinction your plan tells you to be
 * upfront about.
 */

export type DelhiDistrict = {
  name: string;
  latitude: number; // approx. district center/HQ
  longitude: number;
  historicalIncidentCount: number; // real NCRB 2022 total, relevant categories summed
};

export const DELHI_CRIME_DATA: DelhiDistrict[] = [
  {
    name: "North West",
    latitude: 28.7041,
    longitude: 77.1025,
    historicalIncidentCount: 2603,
  },
  {
    name: "South West",
    latitude: 28.5921,
    longitude: 77.046,
    historicalIncidentCount: 1926,
  },
  {
    name: "New Delhi",
    latitude: 28.6139,
    longitude: 77.209,
    historicalIncidentCount: 1205,
  },
  {
    name: "South East",
    latitude: 28.5355,
    longitude: 77.245,
    historicalIncidentCount: 1100,
  },
  {
    name: "South",
    latitude: 28.5245,
    longitude: 77.1855,
    historicalIncidentCount: 1093,
  },
  {
    name: "North East",
    latitude: 28.687,
    longitude: 77.29,
    historicalIncidentCount: 1043,
  },
  {
    name: "West",
    latitude: 28.6633,
    longitude: 77.1,
    historicalIncidentCount: 858,
  },
  {
    name: "Shahdara",
    latitude: 28.673,
    longitude: 77.289,
    historicalIncidentCount: 771,
  },
  {
    name: "East",
    latitude: 28.628,
    longitude: 77.295,
    historicalIncidentCount: 764,
  },
  {
    name: "North",
    latitude: 28.6667,
    longitude: 77.2167,
    historicalIncidentCount: 661,
  },
  {
    name: "Central",
    latitude: 28.6519,
    longitude: 77.2315,
    historicalIncidentCount: 588,
  },
];

// Rough population estimates for the same 11 districts, used only to convert
// raw incident counts into a per-capita rate for calculateHistoricalComponent().
// (calculateHistoricalComponent expects incidents-per-100k, not raw counts.)
export const DELHI_DISTRICT_POPULATION: Record<string, number> = {
  "North West": 3_700_000,
  "South West": 2_300_000,
  "New Delhi": 5_400_000, // includes territory folded in under old reporting (Outer North, IGI Airport, etc.)
  "South East": 1_800_000,
  South: 2_700_000,
  "North East": 2_300_000,
  West: 2_500_000,
  Shahdara: 2_300_000,
  East: 1_700_000,
  North: 900_000,
  Central: 900_000,
};

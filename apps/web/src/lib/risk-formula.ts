// a) Historical component — incidents per capita, normalized 0-100
// a) Historical component — incidents per capita, normalized 0-100
export function calculateHistoricalComponent(
  districtIncidentCount: number,
  districtPopulation: number
): number {
  const perCapita = (districtIncidentCount / districtPopulation) * 100000;
  // Calibrated against REAL Delhi 2022 NCRB data: actual per-100k rates
  // across Delhi's 11 districts range from ~22 (New Delhi) to ~84 (South
  // West). 90 is used as the ceiling so the highest real district lands
  // near the top of the scale, giving real color spread instead of every
  // district compressing into "low" under an unrealistically high assumed max.
  const normalized = Math.min((perCapita / 90) * 100, 100);
  return Math.round(normalized);
}

export function calculateLiveComponent(reports: Report[]): number {
  if (reports.length === 0) return 0;

  const weightedScores = reports.map((r) => {
    const daysSince = (Date.now() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const recencyWeight = Math.max(0, 1 - daysSince / 30);
    const confidenceWeight = r.status === "community-corroborated" ? 1.0 : 0.5;
    return r.severity * recencyWeight * confidenceWeight;
  });

  const average = weightedScores.reduce((sum, s) => sum + s, 0) / weightedScores.length;
  const normalized = Math.min((average / 5) * 100, 100);
  return Math.round(normalized);
}

// c) Time-of-day risk term — direct 0-100 contribution, per the plan's exact formula
export function calculateTimeOfDayScore(currentHour: number): number {
  return currentHour >= 22 || currentHour < 5 ? 100 : 0;
}

// d) Combined score — exact plan formula: 0.4 historical + 0.4 live + 0.2 time-of-day
export function calculateCombinedScore(
  historicalBaseline: number,
  recentWeightedReports: number,
  timeOfDayScore: number
): number {
  const combined = 0.4 * historicalBaseline + 0.4 * recentWeightedReports + 0.2 * timeOfDayScore;
  return Math.min(Math.round(combined), 100);
}
/**
 * One-shot cleanup for noisy NewsIncident rows ingested before quality filters.
 * - Marks city-centroid / city-level rows as affectsHeatmap=false
 * - Drops clearly non-incident titles (blocklist)
 * - Recomputes RiskScore for remaining heatmap geohashes
 *
 * Usage: bun run src/cleanup-news.ts
 */
import path from "node:path";

import dotenv from "dotenv";

import { isBlockedTitle, isCityLevelName, isNearCityCentroid } from "./news-filters";
import { recomputeRiskForGeohashes } from "./recompute-risk";

dotenv.config({ path: path.join(import.meta.dir, "../../../apps/server/.env") });

const { default: prisma } = await import("./index");

async function main() {
  console.log("=== NewsIncident cleanup ===\n");

  const all = await prisma.newsIncident.findMany();
  console.log(`Total rows: ${all.length}`);

  let disabled = 0;
  let deleted = 0;
  const keepGeohashes = new Set<string>();

  for (const row of all) {
    const blocked = isBlockedTitle(row.title);
    const cityLevel =
      isNearCityCentroid(row.latitude, row.longitude) ||
      (row.localityName ? isCityLevelName(row.localityName) : false);

    if (blocked) {
      await prisma.newsIncident.delete({ where: { id: row.id } });
      deleted++;
      continue;
    }

    if (cityLevel && row.affectsHeatmap) {
      await prisma.newsIncident.update({
        where: { id: row.id },
        data: { affectsHeatmap: false, localityName: row.localityName ?? "Delhi" },
      });
      disabled++;
      continue;
    }

    if (row.affectsHeatmap) {
      keepGeohashes.add(row.geohash);
    }
  }

  console.log(`Deleted (blocklist):     ${deleted}`);
  console.log(`Disabled city-centroid:  ${disabled}`);
  console.log(`Heatmap-eligible left:   ${keepGeohashes.size} geohashes`);

  // Also recompute any existing risk cells so stale high scores drop
  const riskCells = await prisma.riskScore.findMany({ select: { geohash: true } });
  for (const r of riskCells) keepGeohashes.add(r.geohash);

  console.log(`\nRecomputing ${keepGeohashes.size} risk cells...`);
  const n = await recomputeRiskForGeohashes(prisma, keepGeohashes);
  console.log(`Updated ${n} cells. Done.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

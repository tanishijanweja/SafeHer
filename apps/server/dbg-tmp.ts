import prisma from "@safe-her/db";
async function main() {
  const all = await prisma.newsIncident.findMany({
    where: { OR: [
      { title: { contains: "chhatarpur" } },
      { title: { contains: "shiv temple" } },
      { title: { contains: "railway track" } },
    ]},
    select: { title:true, localityName:true, geohash:true, url:true, dedupeKey:true, latitude:true, longitude:true, affectsHeatmap:true, publishedAt:true },
  });
  for (const r of all) {
    console.log(`loc=${String(r.localityName).padEnd(14)} gh=${r.geohash} ht=${r.affectsHeatmap} | ${r.title.slice(0,36)} | url=${String(r.url).slice(0,45)}`);
  }
}
main().finally(()=>prisma.$disconnect());

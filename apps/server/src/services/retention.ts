import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

import prisma from "@safe-her/db";

import { deleteMedia, mediaIdOf, uploadDir } from "./media-store";

/** How long SOS events and their evidence (live location + audio) are kept. */
const RETENTION_DAYS = Number(process.env.SOS_RETENTION_DAYS ?? 30);
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Orphaned uploads are reaped once they're older than an hour so an upload
 *  that's still in-flight is never deleted. */
const ORPHAN_GRACE_MS = 60 * 60 * 1000;

/**
 * Enforce the data-retention policy: erase SOS events (and their live-location
 * history) past the retention window, along with every media clip that
 * belonged to them or is no longer referenced. This keeps sensitive distress
 * recordings and location trails from lingering in storage forever.
 */
export async function runRetentionCleanup(now = Date.now()): Promise<{
  deletedEvents: number;
  deletedMedia: number;
}> {
  const cutoff = new Date(now - RETENTION_MS);

  // 1. SOS events older than the window.
  const stale = await prisma.sOSEvent.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, audioUrl: true },
  });

  let deletedMedia = 0;
  for (const event of stale) {
    const mediaId = mediaIdOf(event.audioUrl ?? "");
    if (mediaId) {
      await deleteMedia(mediaId);
      deletedMedia += 1;
    }
  }

  if (stale.length > 0) {
    await prisma.sOSEvent.deleteMany({
      where: { id: { in: stale.map((event) => event.id) } },
    });
  }

  // 2. Orphaned uploads (no event row references them, or only old events do).
  const dir = uploadDir();
  try {
    const live = await prisma.sOSEvent.findMany({
      where: { audioUrl: { not: null } },
      select: { audioUrl: true },
    });
    const liveKeys = new Set(
      live.map((event) => mediaIdOf(event.audioUrl ?? "")).filter(Boolean),
    );
    const files = await readdir(dir).catch(() => [] as string[]);
    for (const file of files) {
      const id = file.split(".")[0] ?? "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
      if (liveKeys.has(id.toLowerCase())) continue;
      try {
        const info = await stat(path.join(dir, file));
        if (now - info.mtimeMs > ORPHAN_GRACE_MS) {
          await unlink(path.join(dir, file));
          deletedMedia += 1;
        }
      } catch {
        // best-effort
      }
    }
  } catch {
    // DB/filesystem hiccup — retention is best-effort and re-runs later.
  }

  return { deletedEvents: stale.length, deletedMedia };
}
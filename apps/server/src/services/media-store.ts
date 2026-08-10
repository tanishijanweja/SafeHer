import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const MIME_TO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/opus": "opus",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "video/webm": "webm",
  "video/mp4": "mp4",
};

/** How long a media link shared with trusted contacts stays valid. */
const MEDIA_TTL_MS = Number(process.env.SOS_MEDIA_TTL_SECONDS ?? 7 * 24 * 3600) * 1000;

/**
 * HMAC key for signed media links. Prefer a dedicated SOS_MEDIA_SECRET;
 * otherwise derive from the auth secret so links can't be forged without it.
 * If neither is configured, fail closed — a hardcoded, guessable key would let
 * anyone forge valid signed URLs and read any victim's SOS audio.
 */
function signingSecret(): string {
  const explicit = process.env.SOS_MEDIA_SECRET?.trim();
  if (explicit) return explicit;
  const derivedFrom = process.env.BETTER_AUTH_SECRET?.trim();
  if (derivedFrom) {
    return createHmac("sha256", "safeher-media-signing").update(derivedFrom).digest("hex");
  }
  throw new Error(
    "Media signing key is not configured: set SOS_MEDIA_SECRET or BETTER_AUTH_SECRET",
  );
}

export function uploadDir(): string {
  return process.env.SOS_UPLOAD_DIR
    ? path.resolve(process.env.SOS_UPLOAD_DIR)
    : path.resolve(process.cwd(), "uploads");
}

export type SavedMedia = {
  id: string;
  extension: string;
  contentType: string;
};

/** Header signatures for the formats we accept. The bytes are the source of
 *  truth — a client-supplied MIME type is only a hint and is never trusted to
 *  decide the stored type (that would allow an HTML/JS polyglot to be served
 *  back as "media"). */
function sniffMediaType(bytes: Uint8Array): { contentType: string; extension: string } | null {
  const head = bytes;
  const has = (offset: number, magic: number[]) =>
    offset + magic.length <= head.length &&
    magic.every((b, i) => head[offset + i] === b);

  if (has(0, [0x1a, 0x45, 0xdf, 0xa3])) return { contentType: "video/webm", extension: "webm" };
  if (has(0, [0x4f, 0x67, 0x67, 0x53])) return { contentType: "audio/ogg", extension: "ogg" };
  if (has(0, [0x49, 0x44, 0x33])) return { contentType: "audio/mpeg", extension: "mp3" };
  // MPEG frame sync (0xFF Ex)
  if (head.length >= 2 && head[0] === 0xff && (head[1]! & 0xe0) === 0xe0) {
    return { contentType: "audio/mpeg", extension: "mp3" };
  }
  // ISO-BMFF container (mp4/m4a)
  if (has(4, [0x66, 0x74, 0x79, 0x70])) return { contentType: "audio/mp4", extension: "m4a" };

  return null;
}

export async function saveMedia(
  bytes: Uint8Array,
  mimeType?: string | null,
): Promise<SavedMedia> {
  void mimeType; // never trusted — the bytes determine the real type
  const sniffed = sniffMediaType(bytes);
  if (!sniffed) {
    throw new Error("Unsupported or invalid media file");
  }
  const { contentType, extension } = sniffed;
  const id = randomUUID();
  const dir = uploadDir();
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${id}.${extension}`), bytes);
  return { id, extension, contentType };
}

export async function readMedia(id: string): Promise<{
  bytes: Uint8Array;
  contentType: string;
} | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  const dir = uploadDir();
  if (!existsSync(dir)) return null;
  const entries = await readdir(dir).catch(() => [] as string[]);
  const match = entries.find((name) => name.startsWith(`${id}.`));
  if (!match) return null;
  const extension = match.split(".").pop()?.toLowerCase() ?? "bin";
  const contentType =
    Object.entries(MIME_TO_EXT).find(([, ext]) => ext === extension)?.[0] ??
    "application/octet-stream";
  const bytes = await readFile(path.join(dir, match));
  return { bytes: new Uint8Array(bytes), contentType };
}

export async function deleteMedia(id: string): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
  const dir = uploadDir();
  if (!existsSync(dir)) return;
  const entries = await readdir(dir).catch(() => [] as string[]);
  const match = entries.find((name) => name.startsWith(`${id}.`));
  if (!match) return;
  try {
    await unlink(path.join(dir, match));
  } catch {
    // best-effort
  }
}

/** Key a signed link against its id + expiry so a token can't be replayed
 *  anywhere else. The id is the media UUID from the URL path. */
function mediaSignature(id: string, expiresAt: number, base: string): string {
  return createHmac("sha256", signingSecret())
    .update(`${id}|${expiresAt}|${base}`)
    .digest("hex");
}

/** Media UUID carried from the URL path (last non-empty segment). */
export function mediaIdOf(base: string): string {
  return base.split("/").filter(Boolean).pop() ?? "";
}

/** Build a short-lived, signed URL for sharing with trusted contacts. */
export function signMediaUrl(base: string, now = Date.now()): string {
  const expiresAt = now + MEDIA_TTL_MS;
  const sig = mediaSignature(mediaIdOf(base), expiresAt, base);
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}exp=${expiresAt}&s=${sig}`;
}

export type MediaRequestCheck =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "expired" };

/** Validate an incoming signed-media request (constant-time signature check). */
export function verifyMediaRequest(
  base: string,
  expiresRaw: string | undefined,
  sigRaw: string | undefined,
): MediaRequestCheck {
  const id = mediaIdOf(base);
  if (!expiresRaw || !sigRaw) return { ok: false, reason: "missing" };
  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
    return { ok: false, reason: "invalid" };
  }
  if (Date.now() > expiresAt) return { ok: false, reason: "expired" };

  const expected = Buffer.from(mediaSignature(id, expiresAt, base));
  const provided = Buffer.from(sigRaw);
  if (expected.length !== provided.length) return { ok: false, reason: "invalid" };
  return timingSafeEqual(expected, provided)
    ? { ok: true }
    : { ok: false, reason: "invalid" };
}
import { Hono } from "hono";
import { z } from "zod";

import { auth } from "@safe-her/auth";
import prisma from "@safe-her/db";

import {
  notifyTrustedContacts,
  type SosAlertPayload,
} from "../services/notify";
import {
  readMedia,
  saveMedia,
  signMediaUrl,
  verifyMediaRequest,
} from "../services/media-store";

const DEFAULT_EMERGENCY_MESSAGE =
  "I need help right now. Please contact someone near my location or the emergency services.";

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

const sosSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  batteryLevel: z.number().int().min(0).max(100).optional(),
  location: z.string().max(500).optional(),
  emergencyMessage: z.string().trim().max(1000).optional(),
});

const sosUpdateSchema = z.object({
  eventId: z.string().min(1),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  location: z.string().max(500).optional(),
});

function mapsUrlFor(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}&z=16`;
}

function coordinatesOf(lat?: number, lng?: number): string | null {
  return lat !== undefined && lng !== undefined
    ? `${lat.toFixed(6)},${lng.toFixed(6)}`
    : null;
}

const sosRouter = new Hono();

sosRouter.post("/", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = sosSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const contacts = await prisma.trustedContact.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  if (contacts.length === 0) {
    return c.json(
      {
        error:
          "You have no trusted contacts yet. Add trusted contacts so your SOS can be sent to them.",
      },
      400,
    );
  }

  const { latitude, longitude, batteryLevel, location, emergencyMessage } =
    parsed.data;

  const coords = coordinatesOf(latitude, longitude);
  const mapsUrl = coords ? mapsUrlFor(latitude!, longitude!) : null;
  const locationNote = location?.trim() || null;

  const event = await prisma.sOSEvent.create({
    data: {
      userId: session.user.id,
      location: location ?? coords,
      batteryLevel,
      contactsNotified: false,
    },
  });

  const payload: SosAlertPayload = {
    userName: session.user.name ?? "a SafeHer user",
    timestamp: new Date().toISOString(),
    mapsUrl,
    coordinates: coords,
    location: locationNote,
    emergencyMessage: emergencyMessage ?? DEFAULT_EMERGENCY_MESSAGE,
    batteryLevel,
    audioUrl: null,
    eventId: event.id,
  };

  const notifiedContacts = await notifyTrustedContacts(contacts, payload);

  await prisma.sOSEvent.update({
    where: { id: event.id },
    data: { contactsNotified: true },
  });

  return c.json(
    {
      event: { id: event.id, contactsNotified: true },
      notifiedContacts,
    },
    201,
  );
});

// Upload a live audio/video clip for an active SOS event and re-notify contacts.
sosRouter.post("/media", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const form = (await c.req
    .parseBody()
    .catch(() => ({}))) as Record<string, string | File>;
  const file = form["file"];
  const eventId = typeof form["eventId"] === "string" ? form["eventId"] : undefined;

  if (!eventId) {
    return c.json({ error: "Missing event" }, 400);
  }

  if (!file || typeof (file as { size?: number }).size !== "number") {
    return c.json({ error: "Missing file upload" }, 400);
  }
  if ((file as { size: number }).size <= 0) {
    return c.json({ error: "Empty file" }, 400);
  }
  if ((file as { size: number }).size > MAX_MEDIA_BYTES) {
    return c.json({ error: "Recording is too large (max 50 MB)" }, 413);
  }

  if (eventId) {
    const event = await prisma.sOSEvent.findFirst({
      where: { id: eventId, userId: session.user.id },
    });
    if (!event) {
      return c.json({ error: "SOS event not found" }, 404);
    }
  }

  const bytes = new Uint8Array(await (file as Blob).arrayBuffer());
  const mimeType = (file as { type?: string }).type;
  // Only allow audio/video emergency clips — never html/javascript payloads.
  if (mimeType && !/^(audio|video)\//.test(mimeType)) {
    return c.json({ error: "Unsupported media type" }, 415);
  }
  let saved: Awaited<ReturnType<typeof saveMedia>>;
  try {
    saved = await saveMedia(bytes, mimeType);
  } catch {
    // Magic-byte check failed: the bytes are not a recognised audio/video
    // container (or don't match what the extension claims).
    return c.json({ error: "Unsupported media type" }, 415);
  }
  const id = saved.id;
  const mediaBase = `${new URL(c.req.url).origin}/sos/media/${id}`;
  const mediaUrl = signMediaUrl(mediaBase);

  let notifiedContacts: Awaited<ReturnType<typeof notifyTrustedContacts>> = [];
  if (eventId) {
    const contacts = await prisma.trustedContact.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
    });
    const event = await prisma.sOSEvent.update({
      where: { id: eventId },
      data: { audioUrl: mediaBase },
    });
    const payload: SosAlertPayload = {
      userName: session.user.name ?? "a SafeHer user",
      timestamp: new Date().toISOString(),
      mapsUrl: event.location?.startsWith("http") ? event.location : null,
      coordinates: event.location && !event.location.startsWith("http") ? event.location : null,
      emergencyMessage: DEFAULT_EMERGENCY_MESSAGE,
      audioUrl: mediaUrl,
      eventId: event.id,
    };
    notifiedContacts = await notifyTrustedContacts(contacts, payload);
  }

  return c.json(
    { mediaId: id, mediaUrl, notifiedContacts },
    { status: eventId ? 201 : 200 },
  );
});

sosRouter.get("/media/:id", async (c) => {
  const id = c.req.param("id");
  // Media clips contain sensitive live audio: never serve without a valid
  // unexpired signature. The web app never fetches them directly; only the
  // short-lived links shared with trusted contacts carry one.
  const check = verifyMediaRequest(
    `${new URL(c.req.url).origin}/sos/media/${id}`,
    c.req.query("exp"),
    c.req.query("s"),
  );
  if (check.ok !== true) {
    c.header("Cache-Control", "no-store");
    return c.json(
      { error: check.reason === "expired" ? "Link expired" : "Forbidden" },
      check.reason === "expired" ? 410 : 403,
    );
  }

  const media = await readMedia(id);
  if (!media) {
    return c.json({ error: "Recording not found" }, 404);
  }
  return new Response(media.bytes, {
    headers: {
      "Content-Type": media.contentType,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
});

// Periodic live-location refresh during an active SOS — reuses the same event.
sosRouter.post("/update", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = sosUpdateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { eventId, latitude, longitude, location } = parsed.data;

  const coords = coordinatesOf(latitude, longitude);
  const mapsUrl = location ?? (coords ? mapsUrlFor(latitude!, longitude!) : null);

  const event = await prisma.sOSEvent.findFirst({
    where: { id: eventId, userId: session.user.id },
  });
  if (!event) {
    return c.json({ error: "SOS event not found" }, 404);
  }

  const contacts = await prisma.trustedContact.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  const updated = await prisma.sOSEvent.update({
    where: { id: event.id },
    data: { location: mapsUrl ?? event.location, contactsNotified: true },
  });

  const payload: SosAlertPayload = {
    userName: session.user.name ?? "a SafeHer user",
    timestamp: new Date().toISOString(),
    mapsUrl,
    coordinates: coords,
    emergencyMessage: DEFAULT_EMERGENCY_MESSAGE,
    audioUrl: updated.audioUrl ? signMediaUrl(updated.audioUrl) : null,
    eventId: event.id,
  };

  const notifiedContacts = await notifyTrustedContacts(contacts, payload);

  return c.json({ event: { id: event.id }, notifiedContacts }, 200);
});

export default sosRouter;
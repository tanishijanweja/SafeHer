import { Hono } from "hono";
import { z } from "zod";

import { auth } from "@safe-her/auth";
import prisma from "@safe-her/db";

import {
  notifyTrustedContacts,
  type SosAlertPayload,
} from "../services/notify";

const DEFAULT_EMERGENCY_MESSAGE =
  "I need help right now. Please contact someone near my location or the emergency services.";

const sosSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  batteryLevel: z.number().int().min(0).max(100).optional(),
  location: z.string().max(500).optional(),
  emergencyMessage: z.string().trim().max(1000).optional(),
});

function mapsUrlFor(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}&z=16`;
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

  const coords =
    latitude !== undefined && longitude !== undefined
      ? `${latitude.toFixed(6)},${longitude.toFixed(6)}`
      : null;

  const mapsUrl = location ?? (coords ? mapsUrlFor(latitude!, longitude!) : null);

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
    emergencyMessage: emergencyMessage ?? DEFAULT_EMERGENCY_MESSAGE,
    batteryLevel,
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

export default sosRouter;

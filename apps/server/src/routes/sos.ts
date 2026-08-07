import { Hono } from "hono";
import { z } from "zod";

import { auth } from "@safe-her/auth";
import prisma from "@safe-her/db";

import { notifyTrustedContacts } from "../services/notify";

const sosSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  batteryLevel: z.number().int().min(0).max(100).optional(),
  location: z.string().max(500).optional(),
});

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

  const { latitude, longitude, batteryLevel, location } = parsed.data;

  const coords =
    latitude !== undefined && longitude !== undefined
      ? `${latitude.toFixed(6)},${longitude.toFixed(6)}`
      : null;

  const event = await prisma.sOSEvent.create({
    data: {
      userId: session.user.id,
      location: location ?? coords,
      batteryLevel,
      contactsNotified: false,
    },
  });

  const message = [
    `SOS triggered by ${session.user.name ?? "a SafeHer user"}`,
    `Location: ${location ?? coords ?? "unknown"}`,
    batteryLevel !== undefined ? `Battery: ${batteryLevel}%` : null,
  ]
    .filter(Boolean)
    .join(" · ") + ". Please reach out immediately.";

  const notifiedContacts = await notifyTrustedContacts(contacts, message);

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

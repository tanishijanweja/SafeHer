import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import { auth } from "@safe-her/auth";
import prisma from "@safe-her/db";

import { normalizePhone, phoneSchema } from "../services/phone";

const MAX_CONTACTS = 10;

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
  phone: phoneSchema,
});

const contactsRouter = new Hono();

async function requireUser(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  return session?.user ?? null;
}

contactsRouter.get("/", async (c) => {
  const user = await requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const contacts = await prisma.trustedContact.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  return c.json(contacts);
});

contactsRouter.post("/", async (c) => {
  const user = await requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = contactSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { name } = parsed.data;
  const phone = normalizePhone(parsed.data.phone);

  const count = await prisma.trustedContact.count({ where: { userId: user.id } });
  if (count >= MAX_CONTACTS) {
    return c.json(
      { error: `You can save up to ${MAX_CONTACTS} trusted contacts` },
      400,
    );
  }

  const duplicate = await prisma.trustedContact.findFirst({
    where: { userId: user.id, phone },
  });
  if (duplicate) {
    return c.json(
      { error: "This phone number is already in your trusted contacts" },
      409,
    );
  }

  const contact = await prisma.trustedContact.create({
    data: { userId: user.id, name, phone },
  });

  return c.json(contact, 201);
});

contactsRouter.patch("/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json({ error: "Invalid contact id" }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = contactSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { name } = parsed.data;
  const phone = normalizePhone(parsed.data.phone);

  const existing = await prisma.trustedContact.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) {
    return c.json({ error: "Contact not found" }, 404);
  }

  const duplicate = await prisma.trustedContact.findFirst({
    where: { userId: user.id, phone, id: { not: id } },
  });
  if (duplicate) {
    return c.json(
      { error: "This phone number is already in your trusted contacts" },
      409,
    );
  }

  const contact = await prisma.trustedContact.update({
    where: { id },
    data: { name, phone },
  });

  return c.json(contact);
});

contactsRouter.delete("/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json({ error: "Invalid contact id" }, 400);
  }

  const existing = await prisma.trustedContact.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) {
    return c.json({ error: "Contact not found" }, 404);
  }

  await prisma.trustedContact.delete({ where: { id } });

  return c.body(null, 204);
});

export default contactsRouter;

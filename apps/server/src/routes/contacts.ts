import { Hono } from "hono";

import { deleteContact, insertContact, listContacts, updateContact } from "../store";
import type { TrustedContact } from "../types";

export const contacts = new Hono();

contacts.get("/", (c) => {
  return c.json({ contacts: listContacts(c.req.query("user_id")) });
});

contacts.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const email = String(body.email ?? "").trim();
  if (!name || !phone || !email) return c.json({ error: "name, phone and email required" }, 400);
  const contact = insertContact({
    name,
    phone,
    email,
    relation: (body.relation as TrustedContact["relation"]) ?? "friend",
    user_id: body.user_id ? String(body.user_id) : "test-user-001",
  });
  return c.json({ contact }, 201);
});

contacts.patch("/:id", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<TrustedContact> = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.phone === "string") patch.phone = body.phone;
  if (typeof body.email === "string") patch.email = body.email;
  if (typeof body.relation === "string") patch.relation = body.relation as never;
  const contact = updateContact(c.req.param("id"), patch);
  if (!contact) return c.json({ error: "not found" }, 404);
  return c.json({ contact });
});

contacts.delete("/:id", (c) => {
  const ok = deleteContact(c.req.param("id"));
  if (!ok) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

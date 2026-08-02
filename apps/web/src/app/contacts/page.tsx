"use client";

import { Mail, Pencil, Phone, Plus, Save, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@safe-her/ui/components/button";
import { Input } from "@safe-her/ui/components/input";
import { Label } from "@safe-her/ui/components/label";

import RequireAuth from "@/components/require-auth";
import { EmptyState } from "@/components/ui-helpers";
import { useActiveUser } from "@/lib/auth";
import { useStoreVersion } from "@/lib/use-store";
import { addContact, ensureSeeded, getContacts, removeContact, sendTestAlert, updateContact } from "@/lib/store";
import { type ContactRelation, type TrustedContact } from "@/lib/types";
import { cn } from "@safe-her/ui/lib/utils";

const RELATIONS: { value: ContactRelation; label: string }[] = [
  { value: "family", label: "Family" },
  { value: "friend", label: "Friend" },
  { value: "guardian", label: "Guardian" },
  { value: "partner", label: "Partner" },
  { value: "other", label: "Other" },
];

export default function ContactsPage() {
  return (
    <RequireAuth>
      <ContactsBody />
    </RequireAuth>
  );
}

function ContactsBody() {
  useStoreVersion();
  const { user } = useActiveUser();
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<TrustedContact | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [relation, setRelation] = useState<ContactRelation>("friend");

  useEffect(() => {
    ensureSeeded();
    setReady(true);
  }, []);

  const contacts = useMemo(() => (ready ? getContacts() : []), [ready]);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setPhone("");
    setEmail("");
    setRelation("friend");
  };

  const openAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (c: TrustedContact) => {
    setEditing(c);
    setName(c.name);
    setPhone(c.phone);
    setEmail(c.email);
    setRelation(c.relation);
    setShowForm(true);
  };

  const save = () => {
    if (!name.trim() || !phone.trim() || !email.trim()) {
      toast.error("Name, phone and email are required");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.error("That email doesn’t look right");
      return;
    }
    const input = { name: name.trim(), phone: phone.trim(), email: email.trim(), relation, user_id: user?.id ?? "test-user-001" };
    if (editing) {
      updateContact(editing.id, input);
      toast.success("Contact updated");
    } else {
      addContact(input);
      toast.success(`${name.trim()} added to your safety network`);
    }
    resetForm();
    setShowForm(false);
  };

  const remove = (c: TrustedContact) => {
    removeContact(c.id);
    toast.success(`${c.name} removed`);
  };

  const testAlert = (c: TrustedContact) => {
    const alert = sendTestAlert(c.id);
    toast.success(alert ? `Test email queued to ${alert.contact_email}` : "Could not send");
  };

  if (!ready) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Trusted contacts</h1>
          <p className="text-xs text-muted-foreground/50">
            These people get an email + in-app alert the moment you trigger an SOS.
          </p>
        </div>
        {!showForm ? (
          <Button
            onClick={openAdd}
            className="h-9 rounded-full bg-pink-500 text-xs font-semibold text-white shadow-lg"
          >
            <Plus className="size-4" /> Add contact
          </Button>
        ) : null}
      </div>

      {showForm ? (
        <div className="mb-5 rounded-2xl border border-pink-400/25 bg-card/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {editing ? "Edit contact" : "New trusted contact"}
            </h2>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="text-muted-foreground/50 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meera Sharma" className="rounded-lg border-pink-400/20 bg-card/80 text-foreground" />
            </Field>
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" className="rounded-lg border-pink-400/20 bg-card/80 text-foreground" />
            </Field>
            <Field label="Email">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" type="email" className="rounded-lg border-pink-400/20 bg-card/80 text-foreground" />
            </Field>
            <Field label="Relation">
              <select
                value={relation}
                onChange={(e) => setRelation(e.target.value as ContactRelation)}
                className="h-8 w-full rounded-lg border border-pink-400/20 bg-card/80 px-2.5 text-xs text-foreground outline-none focus-visible:border-pink-400"
              >
                {RELATIONS.map((r) => (
                  <option key={r.value} value={r.value} className="bg-card text-foreground">
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { resetForm(); setShowForm(false); }} className="rounded-full text-muted-foreground/70">
              Cancel
            </Button>
            <Button onClick={save} className="h-9 rounded-full bg-pink-500 text-xs font-semibold text-white shadow-lg">
              <Save className="size-4" /> {editing ? "Save changes" : "Add contact"}
            </Button>
          </div>
        </div>
      ) : null}

      {contacts.length === 0 ? (
        <EmptyState title="No trusted contacts yet" hint="Add your family or friends so they’re alerted instantly during an SOS." />
      ) : (
        <div className="flex flex-col gap-3">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pink-400/15 bg-card/80 p-4 transition hover:border-pink-400/35"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-pink-500/15 text-primary">
                  <UserRound className="size-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{c.name}</span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider",
                        c.relation === "guardian"
                          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200"
                          : "border-pink-400/25 bg-pink-500/10 text-muted-foreground/70",
                      )}
                    >
                      {c.relation}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground/50">
                    <span className="flex items-center gap-1">
                      <Phone className="size-3" /> {c.phone}
                    </span>
                    <span className="flex items-center gap-1">
                      <Mail className="size-3" /> {c.email}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <ActionButton label="Send test alert" onClick={() => testAlert(c)}>
                  <Mail className="size-3.5" />
                </ActionButton>
                <ActionButton label="Edit" onClick={() => openEdit(c)}>
                  <Pencil className="size-3.5" />
                </ActionButton>
                <ActionButton label="Remove" danger onClick={() => remove(c)}>
                  <Trash2 className="size-3.5" />
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px] uppercase tracking-widest text-muted-foreground/60">{label}</Label>
      {children}
    </div>
  );
}

function ActionButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-full border transition active:scale-95",
        danger
          ? "border-rose-400/30 text-rose-300 hover:bg-rose-500/15"
          : "border-pink-400/25 text-muted-foreground/70 hover:bg-pink-500/10 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

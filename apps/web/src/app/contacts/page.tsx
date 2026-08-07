"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter } from "next/navigation";
import { Pencil, Phone, Plus, Trash2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@safe-her/ui/components/button";
import { Skeleton } from "@safe-her/ui/components/skeleton";

import {
  ApiError,
  deleteContact,
  fetchContacts,
  type TrustedContact,
} from "@/lib/api";
import { authClient } from "@/lib/auth-client";

import { ContactDialog } from "@/components/contacts/contact-dialog";
import { DeleteContactDialog } from "@/components/contacts/delete-dialog";

const MAX_CONTACTS = 10;

export default function ContactsPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TrustedContact | null>(null);
  const [deleting, setDeleting] = useState<TrustedContact | null>(null);
  const [deletingPending, setDeletingPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchContacts();
      setContacts(data);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login?redirect=/contacts");
        return;
      }
      toast.error(error instanceof Error ? error.message : "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (sessionPending) return;
    if (!session) {
      router.replace("/login?redirect=/contacts");
      return;
    }
    void load();
  }, [sessionPending, session, router, load]);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(contact: TrustedContact) {
    setEditing(contact);
    setDialogOpen(true);
  }

  function handleSaved() {
    setDialogOpen(false);
    setEditing(null);
    void load();
  }

  async function handleDelete(contact: TrustedContact) {
    setDeletingPending(true);
    try {
      await deleteContact(contact.id);
      toast.success("Contact removed");
      setDeleting(null);
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete contact");
    } finally {
      setDeletingPending(false);
    }
  }

  const atLimit = contacts.length >= MAX_CONTACTS;

  if (sessionPending) {
    return (
      <main className="flex items-center justify-center p-6">
        <Skeleton className="h-40 w-full max-w-lg rounded-2xl" />
      </main>
    );
  }

  return (
    <main className="relative min-h-0 overflow-y-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,oklch(0.93_0.04_350),transparent_55%)]"
      />
      <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 py-16 sm:px-6">
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-card/80 p-4 ring-1 ring-border/60">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
              <Users className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Trusted contacts</h1>
              <p className="text-xs text-muted-foreground">
                {loading ? "Loading…" : `${contacts.length} / ${MAX_CONTACTS} saved`}
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={openAdd}
            disabled={atLimit}
            title={atLimit ? `You can save up to ${MAX_CONTACTS} trusted contacts` : "Add contact"}
          >
            <Plus />
            Add contact
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center gap-5 rounded-2xl bg-card/60 px-6 py-12 text-center ring-1 ring-border/40">
            <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
              <Users className="size-7" />
            </span>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold tracking-tight">No trusted contacts yet</h2>
              <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
                Add family or friends who should receive your SOS alerts. You can save up to{" "}
                {MAX_CONTACTS} contacts.
              </p>
            </div>
            <Button type="button" onClick={openAdd}>
              <Plus />
              Add your first contact
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {atLimit && (
              <p className="rounded-xl bg-primary/10 px-4 py-3 text-xs text-primary ring-1 ring-primary/15">
                You have reached the {MAX_CONTACTS} contact limit. Delete a contact to add a new
                one.
              </p>
            )}
            <ul className="flex flex-col gap-3">
              {contacts.map((contact) => (
                <li
                  key={contact.id}
                  className="flex items-center gap-3 rounded-2xl bg-card/80 p-4 ring-1 ring-border/60"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
                    <UserRound className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {contact.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{contact.phone}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={`tel:${contact.phone}`}
                      aria-label={`Call ${contact.name}`}
                      title="Call"
                      className="inline-flex size-7 items-center justify-center text-muted-foreground transition outline-none hover:bg-muted hover:text-primary focus-visible:ring-1 focus-visible:ring-ring/50 [&_svg]:size-3.5"
                    >
                      <Phone />
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${contact.name}`}
                      title="Edit"
                      onClick={() => openEdit(contact)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:bg-destructive/10"
                      aria-label={`Delete ${contact.name}`}
                      title="Delete"
                      onClick={() => setDeleting(contact)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ContactDialog
        key={editing?.id ?? "__new__"}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        contact={editing}
        onSaved={handleSaved}
      />

      <DeleteContactDialog
        contact={deleting}
        pending={deletingPending}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        onConfirm={handleDelete}
      />
    </main>
  );
}

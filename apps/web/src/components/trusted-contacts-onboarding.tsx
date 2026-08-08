"use client";

import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { fetchContacts } from "@/lib/api";

import { ContactDialog } from "@/components/contacts/contact-dialog";

const ONBOARD_KEY = "safeher-onboard-contacts";

export default function TrustedContactsOnboarding() {
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isPending || !session) return;
    let shouldOpen = false;
    try {
      shouldOpen = localStorage.getItem(ONBOARD_KEY) === "1";
    } catch {
      // ignore storage access errors (private mode)
    }
    if (!shouldOpen) return;

    let cancelled = false;
    void (async () => {
      try {
        const contacts = await fetchContacts();
        if (cancelled) return;
        if (contacts.length > 0) {
          finish();
          return;
        }
      } catch {
        // offline / API error — open anyway, we can't confirm contacts exist
      }
      if (cancelled) return;
      setOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [isPending, session]);

  function finish() {
    setOpen(false);
    try {
      localStorage.removeItem(ONBOARD_KEY);
    } catch {
      // ignore storage access errors (private mode)
    }
  }

  return (
    <ContactDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) finish();
      }}
      contact={null}
      onSaved={finish}
    />
  );
}

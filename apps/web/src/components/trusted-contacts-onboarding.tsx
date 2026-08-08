"use client";

import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

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
    if (shouldOpen) {
      setOpen(true);
    }
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

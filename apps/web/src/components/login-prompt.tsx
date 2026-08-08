"use client";

import { useEffect, useState } from "react";

import { UserRoundPlus, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@safe-her/ui/components/button";

import { authClient } from "@/lib/auth-client";

const DISMISS_KEY = "safeher-login-prompt-dismissed";

export default function LoginPrompt() {
  const { data: session, isPending } = authClient.useSession();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // ignore storage access errors (private mode)
    }
  }, []);

  if (isPending || session || dismissed) {
    return null;
  }

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore storage access errors (private mode)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
      <div className="relative flex flex-col items-start gap-3 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.09] via-safeher-pink-soft/60 to-transparent p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5 dark:from-primary/[0.08] dark:via-primary/[0.04]">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/10">
          <UserRoundPlus className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Make SafeHer yours</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sign in to save trusted contacts, report incidents and trigger one-tap SOS alerts
            in an emergency.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link href="/login" className="inline-flex">
            <Button className="h-8 rounded-full px-4 text-xs">Sign in</Button>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            aria-label="Dismiss"
            className="rounded-full"
          >
            <X />
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Heart,
  Home,
  LayoutGrid,
  FileText,
  Phone,
  Users,
  HeartPulse,
} from "lucide-react";

import { cn } from "@safe-her/ui/lib/utils";
import { Button } from "@safe-her/ui/components/button";
import {
  DialogBackdrop,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@safe-her/ui/components/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@safe-her/ui/components/tooltip";

import { FakeCall } from "./fake-call";
import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

const links = [
  { to: "/", label: "Home", icon: Home },
  { to: "/heatmap", label: "Live Map", icon: LayoutGrid },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/sos", label: "SOS", icon: HeartPulse },
  { to: "/contacts", label: "Contacts", icon: Users },
] as const;

export default function Header() {
  const pathname = usePathname();
  const [fakeCallDialog, setFakeCallDialog] = useState(false);
  const [fakeCallOpen, setFakeCallOpen] = useState(false);
  const [fakeCallMinimized, setFakeCallMinimized] = useState(false);
  const [fakeCallTooltipOpen, setFakeCallTooltipOpen] = useState(false);

  const overlayOpen = fakeCallDialog || fakeCallOpen;
  const overlayDimmed = overlayOpen && !fakeCallMinimized;

  // Lock body scroll while an overlay is open so the app doesn't shift.
  useEffect(() => {
    if (!overlayDimmed) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [overlayDimmed]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-colors",
        overlayDimmed
          ? "border-border/40 bg-background/60"
          : "border-border/60 bg-background/85 backdrop-blur-xl",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 to-rose-500 shadow-sm shadow-pink-300/40">
            <Heart className="size-4 fill-white text-white" strokeWidth={2} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            Safe<span className="text-primary">Her</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full bg-muted/50 p-1 md:flex">
          {links.map(({ to, label, icon: Icon }) => {
            const active =
              to === "/"
                ? pathname === "/"
                : pathname === to || pathname.startsWith(`${to}/`);
            return (
              <Link
                key={to}
                href={to}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all",
                  active
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/80"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" strokeWidth={2} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <TooltipProvider delay={150}>
            <Tooltip open={fakeCallTooltipOpen} onOpenChange={setFakeCallTooltipOpen}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => {
                      setFakeCallTooltipOpen(false);
                      setFakeCallDialog(true);
                    }}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-input bg-background px-3 text-sm font-semibold text-blue-600 shadow-sm transition hover:bg-muted dark:text-blue-400"
                  />
                }
              >
                <Phone className="size-3.5" />
                Fake call
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="rounded-lg bg-pink-50 px-3 py-2 text-pink-700 shadow-sm ring-1 ring-pink-200/70 dark:bg-pink-950 dark:text-pink-200 dark:ring-pink-800/60 [&>svg]:bg-pink-50 [&>svg]:fill-pink-50 dark:[&>svg]:bg-pink-950 dark:[&>svg]:fill-pink-950"
              >
                <Phone className="size-3.5 shrink-0" />
                Incoming call from Dad — step away safely
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <ModeToggle />
          <UserMenu />
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-t border-border/40 px-3 py-2 md:hidden">
        {links.map(({ to, label, icon: Icon }) => {
          const active =
            to === "/"
              ? pathname === "/"
              : pathname === to || pathname.startsWith(`${to}/`);
          return (
            <Link
              key={to}
              href={to}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </Link>
          );
        })}

        <TooltipProvider delay={150}>
          <Tooltip open={fakeCallTooltipOpen} onOpenChange={setFakeCallTooltipOpen}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => {
                    setFakeCallTooltipOpen(false);
                    setFakeCallDialog(true);
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-muted dark:text-blue-400"
                />
              }
            >
              <Phone className="size-3.5" />
              Fake call
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="rounded-lg bg-pink-50 px-3 py-2 text-pink-700 shadow-sm ring-1 ring-pink-200/70 dark:bg-pink-950 dark:text-pink-200 dark:ring-pink-800/60 [&>svg]:bg-pink-50 [&>svg]:fill-pink-50 dark:[&>svg]:bg-pink-950 dark:[&>svg]:fill-pink-950"
            >
              <Phone className="size-3.5 shrink-0" />
              Incoming call from Dad — step away safely
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </nav>

      <FakeCallDialog
        open={fakeCallDialog}
        onOpenChange={setFakeCallDialog}
        onStart={() => {
          setFakeCallDialog(false);
          setFakeCallOpen(true);
        }}
      />

      {fakeCallOpen &&
        createPortal(
          <FakeCall
            name="Dad"
            phone="+91 98XXX XXXXX"
            onMinimizeChange={setFakeCallMinimized}
            onClose={() => {
              setFakeCallMinimized(false);
              setFakeCallOpen(false);
            }}
          />,
          document.body,
        )}
    </header>
  );
}

function FakeCallDialog({
  open,
  onOpenChange,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: () => void;
}) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop className="backdrop-blur-sm" />
        <DialogPopup className="max-w-sm">
          <div className="space-y-1 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/10 ring-4 ring-emerald-500/15">
              <Phone className="size-6 text-emerald-600" />
            </span>
            <DialogTitle className="pt-3 text-lg">Fake call from Dad</DialogTitle>
            <DialogDescription>
              Play a realistic incoming call so you can step away from a difficult
              situation. Nobody will know it&apos;s not real.
            </DialogDescription>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full rounded-full py-2 text-sm"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onStart}
              className="w-full rounded-full bg-emerald-600 py-2 text-sm text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-700"
            >
              <Phone className="size-4" />
              Start fake call
            </Button>
          </div>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}

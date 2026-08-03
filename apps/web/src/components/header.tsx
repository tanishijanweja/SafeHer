"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart,
  Home,
  LayoutGrid,
  FileText,
  Users,
  HeartPulse,
} from "lucide-react";

import { cn } from "@safe-her/ui/lib/utils";

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

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-xl">
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
      </nav>
    </header>
  );
}

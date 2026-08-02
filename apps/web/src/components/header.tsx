"use client";
import { HeartHandshake, HeartPulse, Home, LayoutGrid, ListChecks, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@safe-her/ui/lib/utils";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

const LINKS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/dashboard", label: "Live Map", icon: LayoutGrid },
  { to: "/reports", label: "Reports", icon: ListChecks },
  { to: "/sos", label: "SOS", icon: HeartPulse },
  { to: "/contacts", label: "Contacts", icon: UsersRound },
] as const;

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-pink-400/15 bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/20">
            <HeartHandshake className="size-4" />
          </span>
          <span className="text-sm font-bold tracking-wide text-foreground">
            Safe<span className="text-gradient-pink">Her</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {LINKS.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || (to !== "/" && pathname.startsWith(to));
            return (
              <Link
                key={to}
                href={to}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "bg-pink-500/15 text-foreground ring-1 ring-pink-400/40"
                    : "text-muted-foreground/60 hover:bg-pink-500/10 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

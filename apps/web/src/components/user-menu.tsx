"use client";

import { Button } from "@safe-her/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@safe-her/ui/components/dropdown-menu";
import { Skeleton } from "@safe-her/ui/components/skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { clearDemoSession, useActiveUser } from "@/lib/auth";

export default function UserMenu() {
  const router = useRouter();
  const { user, isLoading } = useActiveUser();

  if (isLoading) {
    return <Skeleton className="h-8 w-24 rounded-full" />;
  }

  if (!user) {
    return (
      <Link href="/login">
        <Button variant="outline" className="rounded-full border-pink-400/30 text-foreground">
          Sign In
        </Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="rounded-full border-pink-400/30 text-foreground" />}>
        <span className="mr-1">{user.name}</span>
        <span className="hidden text-muted-foreground/50 sm:inline">▾</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="rounded-lg border-pink-400/20 bg-popover/95 backdrop-blur">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-foreground">My Account</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-pink-400/10" />
          <DropdownMenuItem className="text-muted-foreground/70">{user.email}</DropdownMenuItem>
          {user.isDemo ? (
            <DropdownMenuItem className="text-[11px] text-amber-300/80">
              Demo session (test-user-001)
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              clearDemoSession();
              if (user.isDemo) {
                router.push("/");
              } else {
                authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => router.push("/"),
                  },
                });
              }
            }}
          >
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

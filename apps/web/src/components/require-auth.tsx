"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@safe-her/ui/components/button";

import { setDemoSession, useActiveUser } from "@/lib/auth";

import Loader from "./loader";

/**
 * Gates a page behind a user. When the shared database / better-auth server is
 * running a real account works; until then the "Continue as demo user" button
 * unlocks the app with the shared dummy user test-user-001.
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useActiveUser();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
        <div className="mb-4 flex size-16 items-center justify-center rounded-full border border-pink-400/30 bg-pink-500/10">
          <Lock className="size-7 text-primary" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">You need to sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground/60">
          Sign in to report incidents, trigger an SOS and manage your trusted contacts.
        </p>
        <div className="mt-6 flex w-full flex-col gap-2">
          <Button
            onClick={() => {
              setDemoSession();
              toast.success("Signed in as demo user");
              router.push("/");
            }}
          >
            Continue as demo user (test-user-001)
          </Button>
          <Button variant="outline" onClick={() => router.push("/login")}>
            Sign in / Create account
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

"use client";
import { authClient } from "@/lib/auth-client";

import TwoFactorSettings from "@/components/two-factor-settings";

export default function Dashboard({ session }: { session: typeof authClient.$Infer.Session }) {
  const user = session.user as typeof session.user & { twoFactorEnabled?: boolean };
  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <h1 className="mb-1 text-2xl font-bold">Account</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Manage your security settings.
      </p>
      <TwoFactorSettings enabled={user.twoFactorEnabled === true} />
    </div>
  );
}
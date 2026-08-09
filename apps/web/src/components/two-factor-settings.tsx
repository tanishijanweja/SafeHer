"use client";

import { useState } from "react";

import { Button } from "@safe-her/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@safe-her/ui/components/card";
import { Input } from "@safe-her/ui/components/input";
import { Label } from "@safe-her/ui/components/label";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

export default function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const [twoFactorOn, setTwoFactorOn] = useState(enabled);
  const [password, setPassword] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const beginSetup = async () => {
    setBusy(true);
    const res = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (res.error) {
      toast.error(res.error.message || "Could not start setup");
      return;
    }
    setTotpUri(res.data.totpURI);
    setBackupCodes(res.data.backupCodes ?? []);
  };

  const verifySetup = async () => {
    if (code.trim().length < 6) return;
    setBusy(true);
    const res = await authClient.twoFactor.verifyTotp({ code: code.trim() });
    setBusy(false);
    if (res.error) {
      toast.error(res.error.message || "Invalid code");
      return;
    }
    setTwoFactorOn(true);
    setTotpUri(null);
    setBackupCodes([]);
    setPassword("");
    setCode("");
    toast.success("Two-factor authentication enabled");
  };

  const disable = async () => {
    setBusy(true);
    const res = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (res.error) {
      toast.error(res.error.message || "Could not disable");
      return;
    }
    setTwoFactorOn(false);
    setPassword("");
    toast.success("Two-factor authentication disabled");
  };

  const copy = (value: string, toastMessage: string) => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => toast.success(toastMessage))
      .catch(() => toast.error("Could not copy to clipboard"));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor authentication</CardTitle>
        <CardDescription>
          Adds a one-time code from your authenticator app to every sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {twoFactorOn ? (
          <div className="flex items-center justify-between rounded-md ring-1 ring-foreground/10 px-3 py-2">
            <span className="font-medium text-green-600">Enabled</span>
            <span className="text-muted-foreground">Every sign-in requires a code</span>
          </div>
        ) : (
          <p className="text-xs/relaxed text-muted-foreground">
            Two-factor authentication is off. When you turn it on, sign-in
            will ask for a 6-digit code from your authenticator app (Google
            Authenticator, Authy, etc.).
          </p>
        )}

        {!twoFactorOn && !totpUri && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="2fa-password">Your password</Label>
              <Input
                id="2fa-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button onClick={beginSetup} disabled={busy || !password}>
              {busy ? "Working..." : "Turn on two-factor"}
            </Button>
          </div>
        )}

        {totpUri && (
          <div className="space-y-4">
            <p className="text-xs/relaxed text-muted-foreground">
              Scan or paste this setup key into your authenticator app, then
              enter the 6-digit code to confirm.
            </p>
            <div className="space-y-1">
              <Label>Setup key (otpauth URI)</Label>
              <div className="flex items-center gap-2">
                <code className="block flex-1 truncate rounded bg-muted px-3 py-2 text-[11px] font-mono">
                  {totpUri}
                </code>
                <Button variant="outline" onClick={() => copy(totpUri, "Setup code copied")}>
                  Copy
                </Button>
              </div>
            </div>
            {backupCodes.length > 0 && (
              <div className="space-y-1">
                <Label>Backup codes (save these — each works once)</Label>
                <pre className="rounded bg-muted px-3 py-2 font-mono text-[11px] leading-5">
                  {backupCodes.join("\n")}
                </pre>
                <Button
                  variant="outline"
                  onClick={() => copy(backupCodes.join("\n"), "Backup codes copied")}
                >
                  Copy backup codes
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <div className="space-y-2">
                <Label htmlFor="2fa-code">6-digit code</Label>
                <Input
                  id="2fa-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                />
              </div>
              <Button onClick={verifySetup} disabled={busy || code.length < 6} className="w-full">
                {busy ? "Verifying..." : "Verify & enable"}
              </Button>
            </div>
          </div>
        )}

        {twoFactorOn && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="2fa-disable-password">Confirm your password to disable</Label>
              <Input
                id="2fa-disable-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button variant="destructive" onClick={disable} disabled={busy || !password}>
              {busy ? "Disabling..." : "Disable two-factor"}
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="text-xs/relaxed text-muted-foreground">
        Two-factor uses a per-account key encrypted at rest. If you lose your
        app and backup codes, you will not be able to sign in again.
      </CardFooter>
    </Card>
  );
}
"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, HeartPulse, Loader2, MapPin, Phone, Users } from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@safe-her/ui/components/skeleton";

import {
  ApiError,
  fetchContacts,
  triggerSos,
  type TrustedContact,
} from "@/lib/api";
import { authClient } from "@/lib/auth-client";

const DEFAULT_LOCATION = { lat: 28.6139, lng: 77.209 };

export default function SosPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ count: number; names: string[] } | null>(null);

  useEffect(() => {
    if (isPending || !session) return;
    let cancelled = false;
    setContactsLoading(true);
    fetchContacts()
      .then((data) => {
        if (!cancelled) setContacts(data);
      })
      .catch(() => {
        if (!cancelled) setContacts([]);
      })
      .finally(() => {
        if (!cancelled) setContactsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, session]);

  async function getPosition(): Promise<{ lat: number; lng: number }> {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return DEFAULT_LOCATION;
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }),
        () => resolve(DEFAULT_LOCATION),
        { timeout: 5000 },
      );
    });
  }

  async function getBatteryLevel(): Promise<number | undefined> {
    try {
      const nav = navigator as Navigator & {
        getBattery?: () => Promise<{ level: number }>;
      };
      if (!nav.getBattery) return undefined;
      const battery = await nav.getBattery();
      return Math.round(battery.level * 100);
    } catch {
      return undefined;
    }
  }

  async function handleSos() {
    if (sending) return;
    if (!session) {
      router.push("/login?redirect=/sos");
      return;
    }
    setSending(true);
    setSent(null);
    try {
      const position = await getPosition();
      const batteryLevel = await getBatteryLevel();
      const result = await triggerSos({
        latitude: position.lat,
        longitude: position.lng,
        batteryLevel,
      });
      const names = result.notifiedContacts.map((c) => c.name);
      setSent({ count: result.notifiedContacts.length, names });
      toast.success(
        `SOS sent to ${result.notifiedContacts.length} trusted contact${result.notifiedContacts.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.push("/login?redirect=/sos");
      } else {
        toast.error(
          error instanceof Error ? error.message : "Failed to send SOS. Please try again.",
        );
      }
    } finally {
      setSending(false);
    }
  }

  const noContacts = !contactsLoading && contacts.length === 0;

  return (
    <main className="relative min-h-0 overflow-y-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,oklch(0.92_0.05_20),transparent_55%)]"
      />
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-4 py-16 text-center sm:px-6">
        <span className="flex size-16 items-center justify-center rounded-full bg-safeher-rose/15 text-safeher-rose ring-1 ring-safeher-rose/20">
          <HeartPulse className="size-7" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Panic SOS</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            One tap will share your live location and battery with your trusted contacts and
            surface nearby police stations and hospitals.
          </p>
        </div>

        {sent ? (
          <div className="w-full max-w-xs rounded-2xl bg-card/80 px-5 py-6 ring-1 ring-border/60">
            <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/20">
              <CheckCircle2 className="size-6" />
            </span>
            <h2 className="text-base font-semibold">SOS sent</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Your location was shared with {sent.count} trusted contact
              {sent.count === 1 ? "" : "s"}:
            </p>
            <p className="mt-2 text-xs font-medium text-foreground">
              {sent.names.join(", ")}
            </p>
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled={sending || noContacts}
              className="inline-flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-safeher-rose text-base font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void handleSos()}
            >
              {sending ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <HeartPulse className="size-5" />
              )}
              {sending ? "Sending SOS…" : "Send SOS"}
            </button>

            {noContacts ? (
              <div className="w-full max-w-xs rounded-2xl bg-card/80 px-5 py-4 text-left ring-1 ring-border/60">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Add trusted contacts first — SOS notifications are only sent to your saved
                  contacts.
                </p>
                <Link
                  href="/contacts"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <Users className="size-4" />
                  Manage trusted contacts
                </Link>
              </div>
            ) : null}

            <div className="grid w-full max-w-xs gap-2 text-left text-sm">
              <div className="flex items-center gap-3 rounded-xl bg-card/80 px-4 py-3 ring-1 ring-border/60">
                <MapPin className="size-4 text-primary" />
                Share live location
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-card/80 px-4 py-3 ring-1 ring-border/60">
                <Phone className="size-4 text-primary" />
                {contactsLoading ? (
                  <Skeleton className="h-3.5 w-24 rounded-full" />
                ) : (
                  <>
                    Notify {contacts.length} trusted contact
                    {contacts.length === 1 ? "" : "s"}
                  </>
                )}
              </div>
            </div>
          </>
        )}

        <Link href="/contacts" className="text-sm font-medium text-primary hover:underline">
          Manage trusted contacts →
        </Link>
      </div>
    </main>
  );
}

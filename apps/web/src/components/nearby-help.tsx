"use client";

import { useMemo } from "react";

import { AlertCircle, Building2, Loader2, Phone, Siren, Stethoscope } from "lucide-react";

import { Skeleton } from "@safe-her/ui/components/skeleton";

import type { EmergencyService, EmergencyType } from "@/lib/emergency";

const GROUP_META: Record<EmergencyType, { label: string; icon: typeof Siren }> = {
  helpline: { label: "Emergency helplines", icon: Siren },
  police: { label: "Police stations", icon: Building2 },
  hospital: { label: "Hospitals nearby", icon: Stethoscope },
  fire: { label: "Fire stations", icon: Siren },
};

const ORDER: Record<EmergencyType, number> = {
  helpline: 0,
  police: 1,
  hospital: 2,
  fire: 3,
};

export function NearbyHelp({
  services,
  loading,
  error,
  locationDenied,
}: {
  services: EmergencyService[];
  loading: boolean;
  error: boolean;
  locationDenied: boolean;
}) {
  const groups = useMemo(
    () =>
      Array.from(
        services.reduce((map, s) => {
          const arr = map.get(s.type) ?? [];
          arr.push(s);
          map.set(s.type, arr);
          return map;
        }, new Map<EmergencyType, EmergencyService[]>()),
      )
        .sort((a, b) => ORDER[a[0]] - ORDER[b[0]])
        .map(([type, items]) => ({
          type,
          meta: GROUP_META[type],
          items: items.slice(0, 5),
        })),
    [services],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-foreground uppercase">
          <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
          Get help near you
        </h3>
        {loading ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Updating…
          </span>
        ) : (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {locationDenied ? "using tapped location" : "live"}
          </span>
        )}
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600 ring-1 ring-red-200 dark:bg-red-500/10 dark:ring-red-500/30">
          <AlertCircle className="size-4 shrink-0" />
          Couldn't load nearby services right now.
        </div>
      ) : loading && groups.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(({ type, meta, items }) => {
            const Icon = meta.icon;
            return (
              <div key={type}>
                <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <Icon className="size-3.5" />
                  {meta.label}
                </h4>
                <ul className="grid gap-1.5">
                  {items.map((item) => (
                    <NearbyRow key={item.id} item={item} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NearbyRow({ item }: { item: EmergencyService }) {
  const callable = Boolean(item.phone);
  return (
    <li className="flex items-center gap-2.5 rounded-xl bg-card/80 p-2.5 ring-1 ring-border/60">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-600/10 text-red-600 ring-1 ring-red-600/15">
        <GroupIcon type={item.type} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-foreground">{item.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {item.phone ?? item.address ?? "No public number"}
        </p>
      </div>
      <span className="shrink-0 text-[10px] font-medium text-muted-foreground/70">
        {item.distanceLabel}
      </span>
      <a
        href={callable ? `tel:${item.phone}` : "#"}
        aria-disabled={!callable}
        onClick={(e) => {
          if (!callable) e.preventDefault();
        }}
        aria-label={callable ? `Call ${item.name}` : `${item.name} has no number`}
        className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full transition ${
          callable
            ? "bg-red-600 text-white shadow-sm hover:brightness-110 active:scale-95"
            : "bg-muted text-muted-foreground/40"
        }`}
      >
        <Phone className="size-3.5" />
      </a>
    </li>
  );
}

function GroupIcon({ type }: { type: EmergencyType }) {
  const Icon = GROUP_META[type].icon;
  return <Icon className="size-4" />;
}
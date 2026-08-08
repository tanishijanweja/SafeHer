"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronUp, Minimize2, Phone, PhoneOff, UserRound } from "lucide-react";

type Stage = "incoming" | "in-call";

/**
 * Emergency decoy: shows a realistic "incoming call" so a person in danger can
 * excuse themselves from a threatening situation (e.g. in a cab) without the
 * caller knowing it's fake.
 */
export function FakeCall({
  name,
  phone,
  onClose,
  onMinimizeChange,
}: {
  name?: string;
  phone?: string;
  onClose: () => void;
  onMinimizeChange?: (minimized: boolean) => void;
}) {
  const [stage, setStage] = useState<Stage>("incoming");
  const [minimized, setMinimized] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const setMinimizedSafe = (value: boolean) => {
    setMinimized(value);
    onMinimizeChange?.(value);
  };

  // Realistic phone ringback tone while the "call" is incoming.
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (stage !== "incoming") return;
    const audio = new Audio("/fake-call-audio.mp3");
    audio.loop = true;
    audio.volume = 1;
    audioRef.current = audio;
    audio.play().catch(() => undefined);
    return () => {
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    };
  }, [stage]);

  // Elapsed timer while "in-call".
  useEffect(() => {
    if (stage !== "in-call") return;
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [stage]);

  const displayName = name || "Home";
  const displayPhone = phone || "+91 ••••• •••••";

  if (stage === "in-call" && minimized) {
    return (
      <div className="fixed bottom-5 left-1/2 z-[5000] w-max -translate-x-1/2 px-4 sm:left-auto sm:right-5 sm:translate-x-0">
        <div className="flex items-center gap-3 rounded-full bg-zinc-950/95 py-2 pl-3 pr-2 text-white shadow-2xl shadow-black/50 ring-1 ring-white/10 backdrop-blur">
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/90">
            <Phone className="size-4 -scale-x-100" />
            <span
              aria-hidden
              className="absolute inset-0 rounded-full ring-[3px] ring-emerald-400/60 safeher-ring"
            />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="max-w-32 truncate text-sm font-semibold">
              {displayName}
            </p>
            <p className="text-[11px] tabular-nums text-emerald-400">
              {formatTime(elapsed)} · In call
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMinimizedSafe(false)}
            aria-label="Expand call"
            className="flex size-10 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/10"
          >
            <ChevronUp className="size-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="End call"
            className="flex size-10 items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-900/40 transition hover:bg-red-500"
          >
            <PhoneOff className="size-4 -scale-x-100" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      {stage === "incoming" ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Incoming call from ${displayName}`}
          className="w-full max-w-sm overflow-hidden rounded-3xl bg-zinc-950 text-white shadow-2xl shadow-black/60 ring-1 ring-white/10"
        >
          <div className="flex items-center justify-between px-6 pt-5 text-[11px] text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
              Incoming call
            </span>
            <span className="rounded-full bg-white/10 px-2 py-0.5">SafeHer</span>
          </div>

          <div className="flex flex-col items-center px-8 pb-8 pt-6 text-center">
            <div className="relative">
              <span className="flex size-24 items-center justify-center rounded-full bg-zinc-800 ring-4 ring-white/10">
                <UserRound className="size-12 text-zinc-400" />
              </span>
              <span
                aria-hidden
                className="absolute inset-0 rounded-full ring-[3px] ring-emerald-400/70 safeher-ring"
              />
            </div>
            <h2 className="mt-5 text-2xl font-bold tracking-tight">
              {displayName}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">{displayPhone}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wider text-emerald-400/80">
              Incoming call
            </p>
          </div>

          <div className="mb-8 flex items-center justify-center gap-12">
            <button
              type="button"
              onClick={onClose}
              aria-label="Decline call"
              className="flex flex-col items-center gap-1.5"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-600/40 transition hover:bg-red-500 active:scale-95">
                <PhoneOff className="size-6 -scale-x-100" />
              </span>
              <span className="text-[11px] text-zinc-400">Decline</span>
            </button>
            <button
              type="button"
              onClick={() => setStage("in-call")}
              aria-label="Answer call"
              className="flex flex-col items-center gap-1.5"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-400 active:scale-95">
                <Phone className="size-6" />
              </span>
              <span className="text-[11px] text-zinc-400">Accept</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-sm flex-col items-center rounded-3xl bg-zinc-950 pb-10 pt-12 text-white shadow-2xl shadow-black/60 ring-1 ring-white/10">
          <div className="flex items-center justify-between px-6 text-[11px] text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Call connected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMinimizedSafe(true)}
                aria-label="Minimize call"
                className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:bg-white/20"
              >
                <Minimize2 className="size-3.5" />
                Minimize
              </button>
              <span className="rounded-full bg-white/10 px-2 py-0.5">
                SafeHer
              </span>
            </div>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-8 py-8 text-center">
            <span className="flex size-24 items-center justify-center rounded-full bg-zinc-800 ring-4 ring-white/10">
              <UserRound className="size-12 text-zinc-400" />
            </span>
            <h2 className="mt-5 text-2xl font-bold tracking-tight">
              {displayName}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">{displayPhone}</p>
            <p className="mt-4 text-xs tabular-nums text-zinc-400">
              {formatTime(elapsed)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-900/40 transition hover:bg-red-500 active:scale-95"
            aria-label="End call"
          >
            <PhoneOff className="size-6 -scale-x-100" />
          </button>
          <span className="mt-2 text-[11px] text-zinc-400">End call</span>
        </div>
      )}
    </div>
  );
}

function formatTime(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
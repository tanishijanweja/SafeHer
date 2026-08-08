"use client";

import { useEffect, useRef, useState } from "react";

import { Loader2, MapPin, Search } from "lucide-react";

import { cn } from "@safe-her/ui/lib/utils";

import { Input } from "@safe-her/ui/components/input";

import { type GeocodeResult, geocodeSearch } from "@/lib/api";

const DEBOUNCE_MS = 350;
const MIN_QUERY_LEN = 3;

function splitDisplayName(displayName: string): { primary: string; secondary: string } {
  const parts = displayName
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) return { primary: displayName, secondary: "" };
  return { primary: parts[0] ?? "", secondary: parts.slice(1).join(", ") };
}

export type LocationSearchProps = {
  placeholder?: string;
  onSelect: (result: GeocodeResult) => void;
  className?: string;
  autoFocus?: boolean;
};

export default function LocationSearch({
  placeholder = "Search a Delhi locality or address…",
  onSelect,
  className,
  autoFocus,
}: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LEN) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await geocodeSearch(q, controller.signal);
        if (controller.signal.aborted) return;
        setResults(res);
        setOpen(res.length > 0);
        setActiveIndex(res.length > 0 ? 0 : -1);
      } catch {
        if (controller.signal.aborted) return;
        setResults([]);
        setOpen(false);
        setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const choose = (result: GeocodeResult) => {
    onSelect(result);
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : -1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        results.length ? (i - 1 + results.length) % results.length : -1,
      );
      return;
    }
    if (e.key === "Enter" && results.length) {
      e.preventDefault();
      const pick = results[activeIndex >= 0 ? activeIndex : 0];
      if (pick) choose(pick);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="location-search-results"
          className="h-9 rounded-xl pl-8 pr-8"
        />
        {loading ? (
          <Loader2
            className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : null}
      </div>

      {open && results.length > 0 ? (
        <ul
          id="location-search-results"
          role="listbox"
          className="absolute z-[1200] mt-1.5 max-h-72 w-full overflow-auto rounded-xl border border-border bg-card p-1 shadow-xl shadow-black/10 ring-1 ring-black/5 backdrop-blur-md"
        >
          {results.map((result, i) => {
            const label = splitDisplayName(result.displayName);
            return (
              <li key={`${result.lat}:${result.lng}:${result.displayName}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => choose(result)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                    i === activeIndex ? "bg-muted" : "hover:bg-muted/70",
                  )}
                >
                  <MapPin
                    className="mt-0.5 size-3.5 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="line-clamp-1 block font-medium text-foreground">
                      {label.primary || result.displayName}
                    </span>
                    {label.secondary ? (
                      <span className="line-clamp-1 block text-muted-foreground">
                        {label.secondary}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {error ? (
        <p className="mt-1 text-[11px] text-destructive">
          Could not search for that location. Please try again.
        </p>
      ) : null}
    </div>
  );
}

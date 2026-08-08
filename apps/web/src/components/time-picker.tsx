"use client";

import * as React from "react";
import { ChevronDown, Clock } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@safe-her/ui/components/dropdown-menu";
import { cn } from "@safe-her/ui/lib/utils";

const TIME_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const value = `${String(h).padStart(2, "0")}:00`;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const label = `${hour12}:00 ${h < 12 ? "AM" : "PM"}`;
  return { value, label };
});

function formatDisplay(value: string): string {
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export type TimePickerProps = {
  value?: string | null;
  onSelect?: (time: string | null) => void;
  id?: string;
  className?: string;
  placeholder?: string;
};

export function TimePicker({
  value,
  onSelect,
  id,
  className,
  placeholder = "Select approximate time",
}: TimePickerProps) {
  const hasValue = value ? TIME_OPTIONS.some((o) => o.value === value) : false;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id={id}
        className={cn(
          "group inline-flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 text-left text-sm text-foreground outline-none transition-colors",
          "data-popup-open:border-ring data-popup-open:ring-1 data-popup-open:ring-ring/50 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
          !hasValue && "text-muted-foreground",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Clock className="size-3.5 shrink-0 text-muted-foreground" />
          <span className={cn("truncate", hasValue && "font-medium")}>
            {hasValue ? formatDisplay(value!) : placeholder}
          </span>
        </span>
        <span className="shrink-0 text-muted-foreground">
          <ChevronDown className="size-3.5 transition-transform group-data-popup-open:rotate-180" />
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" sideOffset={6}>
        <DropdownMenuRadioGroup
          value={hasValue ? value! : ""}
          onValueChange={(v) => onSelect?.(v)}
        >
          {TIME_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="text-sm"
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

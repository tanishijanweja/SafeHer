"use client";

import * as React from "react";
import { CalendarIcon, ChevronDown, X } from "lucide-react";

import { Button } from "@safe-her/ui/components/button";
import { Calendar } from "@safe-her/ui/components/calendar";
import {
  Popover,
  PopoverPopup,
  PopoverPositioner,
  PopoverPortal,
  PopoverTrigger,
} from "@safe-her/ui/components/popover";
import { cn } from "@safe-her/ui/lib/utils";

function formatDisplay(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type DatePickerProps = {
  value?: Date | null;
  onSelect?: (date: Date | undefined) => void;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  id?: string;
  className?: string;
};

function startOfDayUtc(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export function DatePicker({
  value,
  onSelect,
  minDate,
  maxDate,
  placeholder = "Select a date",
  id,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectDate = React.useCallback(
    (date: Date | undefined) => {
      onSelect?.(date);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setOpen(false), 800);
    },
    [onSelect],
  );

  const isDisabled = React.useCallback(
    (date: Date) => {
      const day = startOfDayUtc(date);
      if (minDate && day < startOfDayUtc(minDate)) return true;
      if (maxDate && day > startOfDayUtc(maxDate)) return true;
      return false;
    },
    [minDate, maxDate],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative", className)}>
        <PopoverTrigger
          id={id}
          className={cn(
            "group inline-flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 text-left text-sm text-foreground outline-none transition-colors",
            "data-open:border-ring data-open:ring-1 data-open:ring-ring/50 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
            !value && "text-muted-foreground",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className={cn("truncate", value && "font-medium")}>
              {value ? formatDisplay(value) : placeholder}
            </span>
          </span>
          <span className="shrink-0 text-muted-foreground">
            <ChevronDown className="size-3.5 transition-transform group-data-open:rotate-180" />
          </span>
        </PopoverTrigger>

        <PopoverPortal>
          <PopoverPositioner align="start" sideOffset={6}>
            <PopoverPopup className="w-auto p-1.5">
              <Calendar
                mode="single"
                selected={value ?? undefined}
                onSelect={selectDate}
                disabled={isDisabled}
              />
              {value ? (
                <div className="mt-1 border-t border-border/60 pt-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectDate(undefined)}
                    className="w-full rounded-lg justify-start text-muted-foreground"
                  >
                    <X className="size-3.5" aria-hidden />
                    Clear date
                  </Button>
                </div>
              ) : null}
            </PopoverPopup>
          </PopoverPositioner>
        </PopoverPortal>
      </div>
    </Popover>
  );
}
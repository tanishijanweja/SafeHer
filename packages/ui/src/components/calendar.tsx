"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayFlag, DayPicker, SelectionState, UI } from "react-day-picker";

import { cn } from "@safe-her/ui/lib/utils";
import { buttonVariants } from "@safe-her/ui/components/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-2.5", className)}
      classNames={{
        [UI.Months]: "relative flex flex-col gap-3",
        [UI.Month]: "flex flex-col gap-2.5",
        [UI.MonthCaption]: "relative flex h-8 items-center justify-center",
        [UI.CaptionLabel]: "text-sm font-semibold",
        [UI.Nav]: "flex items-center gap-1",
        [UI.PreviousMonthButton]: cn(
          buttonVariants({ variant: "outline", size: "icon-xs" }),
          "absolute top-0 left-1 size-7 rounded-lg",
        ),
        [UI.NextMonthButton]: cn(
          buttonVariants({ variant: "outline", size: "icon-xs" }),
          "absolute top-0 right-1 size-7 rounded-lg",
        ),
        [UI.MonthGrid]: "w-full",
        [UI.Weekdays]: "flex",
        [UI.Weekday]:
          "flex size-9 items-center justify-center text-xs font-medium text-muted-foreground/70",
        [UI.Week]: "flex w-full",
        [UI.Day]:
          "size-9 rounded-lg p-0 text-center text-sm focus-within:relative focus-within:z-20",
        [UI.DayButton]: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "relative size-9 rounded-lg p-0 font-normal",
        ),
        [SelectionState.selected]:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus-visible:bg-primary focus-visible:text-primary-foreground",
        [DayFlag.today]:
          "font-semibold after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-current",
        [DayFlag.outside]: "text-muted-foreground/50",
        [DayFlag.disabled]: "text-muted-foreground/40 aria-selected:opacity-100",
        [DayFlag.hidden]: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ className, orientation, ...props }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className={cn("size-4", className)} {...props} />;
        },
      }}
      {...props}
    />
  );
}

export { Calendar };
"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  type DashboardDateRangePreset,
  type DashboardDateRangeValue,
  PRESET_LABELS,
  presetToRange,
} from "@/lib/dashboard/date-range";

const QUICK_PRESETS: Exclude<DashboardDateRangePreset, "custom">[] = [
  "7d",
  "30d",
  "90d",
  "all",
];

type DashboardDateRangePickerProps = {
  value: DashboardDateRangeValue;
  onChange: (value: DashboardDateRangeValue) => void;
  className?: string;
};

function toDateRange(value: DashboardDateRangeValue): DateRange | undefined {
  if (value.preset === "all") return undefined;
  if (!value.from) return undefined;
  return { from: value.from, to: value.to };
}

function formatRangeLabel(value: DashboardDateRangeValue): React.ReactNode {
  if (value.preset === "all") {
    return <span>{PRESET_LABELS.all}</span>;
  }

  const range = toDateRange(value);
  if (range?.from) {
    if (range.to) {
      return (
        <>
          {format(range.from, "LLL dd, y")} - {format(range.to, "LLL dd, y")}
        </>
      );
    }
    return format(range.from, "LLL dd, y");
  }

  if (value.preset !== "custom") {
    return <span>{PRESET_LABELS[value.preset]}</span>;
  }

  return <span>Pick a date</span>;
}

export default function DashboardDateRangePicker({
  value,
  onChange,
  className,
}: DashboardDateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = toDateRange(value);
  const isEmpty = value.preset === "all" || !selected?.from;

  const applyPreset = (preset: Exclude<DashboardDateRangePreset, "custom">) => {
    if (preset === "all") {
      onChange({ preset: "all" });
    } else {
      onChange(presetToRange(preset));
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            data-empty={isEmpty}
            className={cn(
              "h-8 min-w-[220px] justify-start px-2.5 text-left font-normal data-[empty=true]:text-muted-foreground",
              className
            )}
          />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        {formatRangeLabel(value)}
      </PopoverTrigger>
      <PopoverContent
        className="w-auto gap-0 overflow-hidden p-0"
        align="end"
        sideOffset={8}
      >
        <div className="flex flex-wrap gap-1 border-b border-border bg-popover p-2">
          {QUICK_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              variant={value.preset === preset ? "secondary" : "ghost"}
              size="xs"
              onClick={() => applyPreset(preset)}
            >
              {PRESET_LABELS[preset]}
            </Button>
          ))}
        </div>
        <Calendar
          mode="range"
          defaultMonth={selected?.from}
          selected={selected}
          onSelect={(range) => {
            if (!range?.from) return;
            onChange({
              preset: "custom",
              from: range.from,
              to: range.to ?? range.from,
            });
          }}
          numberOfMonths={2}
          disabled={{ after: new Date() }}
        />
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { MONTHS } from "@/lib/months";
import { cn } from "@/lib/cn";

export function MonthPicker({
  month,
  year,
  onChange
}: {
  month: number;
  year: number;
  onChange: (next: { month: number; year: number }) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <button
          aria-label="Previous year"
          className="focus-ring rounded-md p-2 text-text-secondary transition hover:bg-subtle"
          onClick={() => onChange({ month, year: year - 1 })}
          type="button"
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
        </button>
        <div className="text-[13px] font-medium text-text-primary">{year}</div>
        <button
          aria-label="Next year"
          className="focus-ring rounded-md p-2 text-text-secondary transition hover:bg-subtle"
          onClick={() => onChange({ month, year: year + 1 })}
          type="button"
        >
          <ChevronRight size={16} strokeWidth={1.5} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {MONTHS.map((name, index) => (
          <button
            key={name}
            className={cn(
              "focus-ring rounded-md px-3 py-2 text-[12px] transition duration-150 ease-in-out",
              month === index
                ? "bg-accent-soft text-text-primary"
                : "text-text-secondary hover:bg-subtle"
            )}
            onClick={() => onChange({ month: index, year })}
            type="button"
          >
            {name.slice(0, 3)}
          </button>
        ))}
      </div>
    </div>
  );
}

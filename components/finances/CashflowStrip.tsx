"use client";

import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import { MONTHS } from "@/lib/months";
import type { MonthFinances } from "@/types/finance";

/**
 * The year, one row per month, up or down from a centre line.
 *
 * A single month cannot tell you whether a deficit is the shape of the household
 * or the shape of one bad August, so the twelve sit together. Standing figures
 * are the same in every month by design — what moves these bars is house sitting
 * and what the business actually spent.
 *
 * Rows rather than columns: twelve labelled columns on a phone are unreadable,
 * and this is the same shape the Reports breakdown already uses.
 */
export function CashflowStrip({
  months,
  year,
  selectedIndex,
  onSelect
}: {
  months: MonthFinances[];
  year: number;
  selectedIndex: number;
  onSelect: (monthIndex: number) => void;
}) {
  const scale = Math.max(...months.map((month) => Math.abs(month.leftOver)), 1);

  return (
    <section className="rounded-[20px] border border-border bg-surface p-3.5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-medium leading-tight text-text-primary">Left over by month · {year}</h2>
        <div className="flex items-center gap-3 text-[12px] text-text-tertiary">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success" />
            Surplus
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-danger" />
            Deficit
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {months.map((month, index) => {
          const width = (Math.abs(month.leftOver) / scale) * 50;
          const short = month.leftOver < 0;
          const selected = index === selectedIndex;

          return (
            <button
              key={MONTHS[index]}
              className={cn(
                "focus-ring grid w-full grid-cols-[46px_1fr_84px] items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition",
                selected ? "bg-accent-soft" : "hover:bg-subtle"
              )}
              type="button"
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(index)}
            >
              <span className={cn("text-[12px]", selected ? "font-medium text-text-primary" : "text-text-secondary")}>
                {MONTHS[index].slice(0, 3)}
              </span>
              <span className="relative flex h-2.5 items-center rounded-full bg-subtle">
                <span aria-hidden className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border-emphasis" />
                <span
                  className={cn(
                    "absolute h-full transition-all duration-200 ease-in-out",
                    short ? "rounded-l-full bg-danger" : "rounded-r-full bg-success"
                  )}
                  style={
                    short
                      ? { right: "50%", width: `${width}%` }
                      : { left: "50%", width: `${width}%` }
                  }
                />
              </span>
              <span
                className={cn(
                  "text-right text-[12px] font-medium tabular-nums",
                  short ? "text-danger" : "text-text-primary"
                )}
              >
                {short ? "-" : ""}
                {formatCurrency(Math.abs(month.leftOver))}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

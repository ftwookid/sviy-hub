"use client";

import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import { MONTHS } from "@/lib/months";
import type { MonthFinances } from "@/types/finance";

/**
 * Every month of the year, with its figure. Twelve rows, twelve numbers.
 *
 * This is the version that worked, restored. It was briefly replaced by twelve
 * bare columns, and that was a mistake worth writing down: a column chart with no
 * numbers on it cannot answer "how much", so comparing two months meant tapping
 * one, reading the headline, tapping the other and holding the first in your head.
 * Month-over-month comparison is the entire job of this block, and it has to be
 * readable in one view.
 *
 * Twelve rows across a whole screen was too tall a list, and a single narrow
 * rail beside the month left the other column empty once the rail ended. Two
 * columns of six at every width: Jan–Jun, then Jul–Dec. From `sm` each row has
 * room for its bar between the month and the figure.
 */
export function YearList({
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
    <section className="rounded-[20px] border border-border bg-surface p-2.5 shadow-card">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1.5 pt-1">
        <h2 className="text-subhead font-semibold tracking-[-0.01em] text-text-primary">Left over · {year}</h2>
      </div>

      {/* Column-major. A CSS grid fills row by row by default, which put Jan and
          Feb side by side — reading the year meant zig-zagging. `grid-flow-col`
          with six rows fills downwards: Jan–Jun, then Jul–Dec. */}
      <div className="grid grid-flow-col grid-cols-2 grid-rows-6 gap-x-3 gap-y-px sm:gap-x-6">
        {months.map((month, index) => {
          const width = (Math.abs(month.leftOver) / scale) * 100;
          const short = month.leftOver < 0;
          const selected = index === selectedIndex;

          return (
            <button
              key={MONTHS[index]}
              className={cn(
                "focus-ring rounded-lg px-1.5 py-1 text-left transition-colors duration-200 ease-out sm:grid sm:grid-cols-[32px_minmax(0,1fr)_86px] sm:items-center sm:gap-2.5 sm:py-1.5",
                selected ? "bg-accent-soft" : "hover:bg-subtle"
              )}
              type="button"
              aria-current={selected ? "true" : undefined}
              aria-label={`${MONTHS[index]} ${year}, ${short ? "short" : "left over"} ${formatCurrency(
                Math.abs(month.leftOver)
              )}`}
              onClick={() => onSelect(index)}
            >
              <span
                className={cn(
                  "hidden text-meta sm:block",
                  selected ? "font-semibold text-text-primary" : "text-text-secondary"
                )}
              >
                {MONTHS[index].slice(0, 3)}
              </span>

              {/* One line carrying both on a phone, where a middle column would
                  leave the bar about 40px wide. */}
              <span className="flex items-baseline justify-between gap-1.5 sm:hidden">
                <span
                  className={cn(
                    "text-caption",
                    selected ? "font-semibold text-text-primary" : "text-text-secondary"
                  )}
                >
                  {MONTHS[index].slice(0, 3)}
                </span>
                <span
                  className={cn(
                    "truncate text-caption font-medium tabular-nums",
                    short ? "text-danger" : "text-text-primary"
                  )}
                >
                  {short ? "\u2212" : ""}
                  {formatCurrency(Math.abs(month.leftOver))}
                </span>
              </span>

              <span className="mt-0.5 block h-[3px] w-full overflow-hidden rounded-full bg-subtle sm:mt-0 sm:h-2">
                <span
                  className={cn(
                    "block h-full rounded-full transition-all duration-200 ease-out",
                    short ? "bg-danger" : "bg-success"
                  )}
                  style={{ width: `${width}%` }}
                />
              </span>

              <span
                className={cn(
                  "hidden text-right text-meta font-medium tabular-nums sm:block",
                  short ? "text-danger" : "text-text-primary"
                )}
              >
                {short ? "\u2212" : ""}
                {formatCurrency(Math.abs(month.leftOver))}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

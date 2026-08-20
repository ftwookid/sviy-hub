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
 * The only thing actually wrong with it before was the width — twelve rows across
 * a whole screen. So: a narrow column beside the month on a desktop, and two
 * columns of six on a phone, which halves the height without costing a figure.
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
      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
          Left over · {year}
        </h2>
      </div>

      {/* Two columns of six on a phone, one column of twelve in the desktop
          rail. Either way no month is a tap away from being read. */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-px lg:grid-cols-1">
        {months.map((month, index) => {
          const width = (Math.abs(month.leftOver) / scale) * 100;
          const short = month.leftOver < 0;
          const selected = index === selectedIndex;

          return (
            <button
              key={MONTHS[index]}
              className={cn(
                "focus-ring rounded-lg px-1.5 py-1 text-left transition-colors duration-200 ease-out",
                selected ? "bg-accent-soft" : "hover:bg-subtle"
              )}
              type="button"
              aria-current={selected ? "true" : undefined}
              aria-label={`${MONTHS[index]} ${year}, ${short ? "short" : "left over"} ${formatCurrency(
                Math.abs(month.leftOver)
              )}`}
              onClick={() => onSelect(index)}
            >
              <span className="flex items-baseline justify-between gap-1.5">
                <span
                  className={cn(
                    "text-[11.5px]",
                    selected ? "font-semibold text-text-primary" : "text-text-secondary"
                  )}
                >
                  {MONTHS[index].slice(0, 3)}
                </span>
                <span
                  className={cn(
                    "truncate text-[11.5px] font-medium tabular-nums",
                    short ? "text-danger" : "text-text-primary"
                  )}
                >
                  {short ? "−" : ""}
                  {formatCurrency(Math.abs(month.leftOver))}
                </span>
              </span>
              {/* Magnitude under the figure rather than in a column of its own,
                  so the bar costs 3px of height instead of 84px of width. */}
              <span className="mt-0.5 block h-[3px] w-full overflow-hidden rounded-full bg-subtle">
                <span
                  className={cn(
                    "block h-full rounded-full transition-all duration-200 ease-out",
                    short ? "bg-danger" : "bg-success"
                  )}
                  style={{ width: `${width}%` }}
                />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

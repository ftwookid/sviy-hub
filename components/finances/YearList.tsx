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

      {/* Two columns of six on a phone, one wide column in the desktop rail.
          With real width the bar earns its own column between the month and the
          figure, which is the version that reads across; squeezed into a phone
          it drops under the row instead of shrinking to a stub.

          **Column-major on the phone.** A CSS grid fills row by row by default,
          which put Jan and Feb side by side and ran the year left-right,
          left-right down the card — so reading it in order meant zig-zagging,
          and neither column was a sequence on its own. `grid-flow-col` with six
          fixed rows fills downwards instead: Jan–Jun in the left column, Jul–Dec
          in the right, each column a half-year you can read straight down. The
          desktop rail is a single column, where the question never arises, so
          both are reset at `lg`. */}
      <div className="grid grid-flow-col grid-cols-2 grid-rows-6 gap-x-3 gap-y-px lg:grid-flow-row lg:grid-cols-1 lg:grid-rows-none">
        {months.map((month, index) => {
          const width = (Math.abs(month.leftOver) / scale) * 100;
          const short = month.leftOver < 0;
          const selected = index === selectedIndex;

          return (
            <button
              key={MONTHS[index]}
              className={cn(
                "focus-ring rounded-lg px-1.5 py-1 text-left transition-colors duration-200 ease-out lg:grid lg:grid-cols-[32px_minmax(0,1fr)_86px] lg:items-center lg:gap-2.5 lg:py-1.5",
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
                  "hidden text-[12px] lg:block",
                  selected ? "font-semibold text-text-primary" : "text-text-secondary"
                )}
              >
                {MONTHS[index].slice(0, 3)}
              </span>

              {/* One line carrying both on a phone, where a middle column would
                  leave the bar about 40px wide. */}
              <span className="flex items-baseline justify-between gap-1.5 lg:hidden">
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
                  {short ? "\u2212" : ""}
                  {formatCurrency(Math.abs(month.leftOver))}
                </span>
              </span>

              <span className="mt-0.5 block h-[3px] w-full overflow-hidden rounded-full bg-subtle lg:mt-0 lg:h-2">
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
                  "hidden text-right text-[12px] font-medium tabular-nums lg:block",
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

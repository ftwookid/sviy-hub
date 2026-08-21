"use client";

import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import type { MonthFinances } from "@/types/finance";

/**
 * The month as a chain, in the order it actually happens.
 *
 * Gross → what never reaches the account → **net income** → what is spent out of
 * it → what is left. Three figures used to sit here (left over, in, out) and
 * "out" added tax to rent, which produced a number measured against gross pay
 * that was never available to spend. Net income is the figure the household
 * actually recognises, and it only exists if the two kinds of outflow are kept
 * apart.
 *
 * Emphasis is **colour**, per financial convention: green in surplus, red in
 * deficit. That is also the only cue the sign needs, so the label reads "Left
 * over" or "Short" and the figure stays unsigned. Everything is one size — an
 * earlier version set the net two steps larger, which asked the reader why the
 * type kept changing.
 *
 * Two across on a phone, four on a desktop, and every cell a fixed 60px: this
 * card shares a grid row with the month picker at `lg`, and a header that changes
 * height moves the control beside it.
 */

const CELL_HEIGHT = "h-[60px]";

export function MonthSummary({ month }: { month: MonthFinances }) {
  const short = month.leftOver < 0;

  const stats = [
    { label: "Gross in", value: month.moneyIn, tone: "plain" },
    { label: "Net income", value: month.netIncome, tone: "plain" },
    { label: "Spent", value: month.postNet, tone: "plain" },
    { label: short ? "Short" : "Left over", value: month.leftOver, tone: short ? "bad" : "good" }
  ];

  return (
    <section className="grid grid-cols-2 overflow-hidden rounded-[20px] border border-border bg-surface shadow-card lg:grid-cols-4">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={cn(
            "flex min-w-0 flex-col justify-center border-border/70 px-3",
            CELL_HEIGHT,
            index % 2 === 1 ? "border-l" : "",
            index >= 2 ? "border-t lg:border-t-0" : "",
            "lg:border-l lg:first:border-l-0"
          )}
        >
          <div className="truncate text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
            {stat.label}
          </div>
          <div
            className={cn(
              "mt-1 truncate text-[17px] font-medium leading-none tracking-[-0.01em] tabular-nums",
              stat.tone === "bad" ? "text-danger" : stat.tone === "good" ? "text-success" : "text-text-primary"
            )}
          >
            {formatCurrency(Math.abs(stat.value))}
          </div>
        </div>
      ))}
    </section>
  );
}

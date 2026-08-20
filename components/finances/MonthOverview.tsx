"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { currentPeriodMonth, periodMonthLabel, shiftPeriodMonth } from "@/lib/expenses";
import { formatCurrency, formatCurrencyRounded } from "@/lib/formatters";
import { SECTION_STYLE, shareOfIncome } from "@/lib/finances";
import type { MonthFinances } from "@/types/finance";

/**
 * The month at a glance: which month, what it came to, where it went, and how it
 * sits against the other eleven.
 *
 * One container, four bands divided by a rule — not four cards. The three
 * figures run across the full width as a divided strip rather than stacking in
 * the left tenth of the screen, and the year is a twelve-column chart rather
 * than twelve rows, because the question it answers is "what shape is the year",
 * not "what was March". March is one tap away, and its figure then appears in
 * the strip above where the eye already is.
 *
 * The whole month therefore fits above the fold on a phone, which is the only
 * measure that matters here.
 */

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Stat({
  label,
  value,
  tone = "plain",
  lead = false
}: {
  label: string;
  value: string;
  tone?: "plain" | "good" | "bad";
  lead?: boolean;
}) {
  return (
    <div className="min-w-0 px-3 py-2.5 first:pl-0 last:pr-0">
      <div className="truncate text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 truncate font-medium leading-none tracking-[-0.01em] tabular-nums",
          lead ? "text-[25px]" : "text-[15px]",
          tone === "bad" ? "text-danger" : tone === "good" ? "text-success" : "text-text-primary"
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function MonthOverview({
  month,
  months,
  periodMonth,
  monthIndex,
  year,
  onPeriodChange,
  onMonthIndexChange
}: {
  month: MonthFinances;
  months: MonthFinances[];
  periodMonth: string;
  monthIndex: number;
  year: number;
  onPeriodChange: (next: string) => void;
  onMonthIndexChange: (nextIndex: number) => void;
}) {
  const short = month.leftOver < 0;
  const outgoing = month.sections.filter((section) => section.direction === "out");
  const spokenFor = outgoing.reduce((sum, section) => sum + section.total, 0);
  const unallocated = Math.max(0, month.moneyIn - spokenFor);
  const isCurrentMonth = periodMonth === currentPeriodMonth();
  const scale = Math.max(...months.map((entry) => Math.abs(entry.leftOver)), 1);

  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      {/* Month navigation lives on the card it governs rather than in a row of
          its own above it. */}
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button
          className="focus-ring grid h-10 w-9 shrink-0 place-items-center rounded-[10px] text-text-secondary transition-colors duration-200 ease-out hover:bg-subtle hover:text-text-primary"
          type="button"
          aria-label="Previous month"
          onClick={() => onPeriodChange(shiftPeriodMonth(periodMonth, -1))}
        >
          <ChevronLeft size={17} strokeWidth={1.9} />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
          <span className="truncate text-[15px] font-medium text-text-primary">
            {periodMonthLabel(periodMonth)}
          </span>
          {isCurrentMonth ? (
            <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
              Now
            </span>
          ) : null}
        </div>
        <button
          className="focus-ring grid h-10 w-9 shrink-0 place-items-center rounded-[10px] text-text-secondary transition-colors duration-200 ease-out hover:bg-subtle hover:text-text-primary"
          type="button"
          aria-label="Next month"
          onClick={() => onPeriodChange(shiftPeriodMonth(periodMonth, 1))}
        >
          <ChevronRight size={17} strokeWidth={1.9} />
        </button>
      </div>

      {/* Three figures across the row, divided. The answer leads; the two it is
          made of sit beside it at a smaller size. */}
      <div
        className={cn(
          "grid grid-cols-[1.35fr_1fr_1fr] divide-x divide-border/70 border-t border-border/70 px-3.5",
          short ? "bg-[#FBEFEF]" : "bg-[#F7F2E8]"
        )}
      >
        <Stat
          lead
          label={short ? "Short" : "Left over"}
          value={formatCurrencyRounded(Math.abs(month.leftOver))}
          tone={short ? "bad" : "plain"}
        />
        <Stat label="Money in" value={formatCurrencyRounded(month.moneyIn)} />
        <Stat label="Money out" value={formatCurrencyRounded(month.moneyOut)} />
      </div>

      {month.moneyIn > 0 && spokenFor > 0 ? (
        <div className="border-t border-border/70 px-3.5 py-2.5">
          <div className="flex h-2 overflow-hidden rounded-full bg-subtle">
            {outgoing.map((section) => {
              const width = shareOfIncome(section.total, month.moneyIn);
              if (width <= 0) return null;
              return (
                <div
                  key={section.key}
                  className={cn("h-full transition-all duration-200 ease-out", SECTION_STYLE[section.key].color)}
                  style={{ width: `${width * 100}%` }}
                />
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-text-tertiary">
            {outgoing.map((section) =>
              section.total > 0 ? (
                <span key={section.key} className="inline-flex items-center gap-1">
                  <span className={cn("h-1.5 w-1.5 rounded-full", SECTION_STYLE[section.key].color)} />
                  {SECTION_STYLE[section.key].short} {Math.round(shareOfIncome(section.total, month.moneyIn) * 100)}%
                </span>
              ) : null
            )}
            {unallocated > 0 ? (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-subtle ring-1 ring-inset ring-border-emphasis" />
                Left {Math.round(shareOfIncome(unallocated, month.moneyIn) * 100)}%
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* The year, in the height twelve rows used to spend on their labels. */}
      <div className="border-t border-border/70 px-2 pb-1.5 pt-2">
        <div className="grid grid-cols-12 gap-[3px]">
          {months.map((entry, index) => {
            const height = (Math.abs(entry.leftOver) / scale) * 50;
            const deficit = entry.leftOver < 0;
            const selected = index === monthIndex;

            return (
              <button
                key={index}
                className={cn(
                  "focus-ring rounded-[8px] px-0.5 pb-0.5 pt-1 transition-colors duration-200 ease-out",
                  selected ? "bg-accent-soft" : "hover:bg-subtle"
                )}
                type="button"
                aria-label={`${MONTH_SHORT[index]} ${year}, ${
                  deficit ? "short" : "left over"
                } ${formatCurrency(Math.abs(entry.leftOver))}`}
                aria-current={selected ? "true" : undefined}
                onClick={() => onMonthIndexChange(index)}
              >
                <span className="relative block h-9 w-full">
                  <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-border" />
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-1/2 w-[70%] -translate-x-1/2 transition-all duration-200 ease-out",
                      deficit ? "top-1/2 rounded-b-[2px] bg-danger" : "bottom-1/2 rounded-t-[2px] bg-success"
                    )}
                    style={{ height: `${Math.max(height, entry.leftOver === 0 ? 0 : 2)}%` }}
                  />
                </span>
                <span
                  className={cn(
                    "mt-1 block text-center text-[9.5px] leading-none",
                    selected ? "font-semibold text-text-primary" : "text-text-tertiary"
                  )}
                >
                  {MONTH_INITIALS[index]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

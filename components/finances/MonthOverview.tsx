"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { currentPeriodMonth, periodMonthLabel, shiftPeriodMonth } from "@/lib/expenses";
import { formatCurrency } from "@/lib/formatters";
import { SECTION_STYLE, shareOfIncome } from "@/lib/finances";
import type { MonthFinances } from "@/types/finance";

/**
 * The month at a glance: which month, what it came to, where it went, and how it
 * sits against the other eleven.
 *
 * One container, four bands divided by a rule. The three figures run across the
 * full width as a divided strip rather than stacking in the left tenth of the
 * screen, and the year is twelve columns rather than twelve rows — a run of
 * surplus turning into a run of deficit is the thing you actually look for, and
 * it is visible instantly here where twelve labelled numbers only ever read one
 * at a time.
 *
 * What the columns must not do is hide the figures. Month names are spelled out,
 * the year carries its own stepper, and the month under the cursor names itself
 * and its amount above the chart — so nothing needs a tap to be identified, only
 * to be made the subject of the rest of the card.
 */

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Stat({
  label,
  value,
  tone = "plain",
  lead = false
}: {
  label: string;
  value: string;
  tone?: "plain" | "bad";
  lead?: boolean;
}) {
  return (
    <div className="min-w-0 px-2.5 py-2.5 first:pl-0 last:pr-0">
      <div className="truncate text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 truncate font-medium leading-none tracking-[-0.01em] tabular-nums",
          lead ? "text-[20px] sm:text-[24px]" : "text-[13.5px] sm:text-[15px]",
          tone === "bad" ? "text-danger" : "text-text-primary"
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
          ) : (
            <button
              className="focus-ring shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary transition-colors duration-200 ease-out hover:bg-subtle hover:text-text-secondary"
              type="button"
              onClick={() => onPeriodChange(currentPeriodMonth())}
            >
              Today
            </button>
          )}
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
          made of sit beside it at a smaller size. All three keep their cents —
          they are money, and an earlier pass rounded them only to stop the
          columns truncating, which the widths here handle instead. */}
      <div
        className={cn(
          "grid grid-cols-[1.5fr_1fr_1fr] divide-x divide-border/70 border-t border-border/70 px-3.5",
          short ? "bg-[#FBEFEF]" : "bg-[#F7F2E8]"
        )}
      >
        <Stat
          lead
          label={short ? "Short" : "Left over"}
          value={formatCurrency(Math.abs(month.leftOver))}
          tone={short ? "bad" : "plain"}
        />
        <Stat label="Money in" value={formatCurrency(month.moneyIn)} />
        <Stat label="Money out" value={formatCurrency(month.moneyOut)} />
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

      <div className="border-t border-border/70 px-2.5 pb-1.5 pt-2">
        {/* The year owns its own stepper, so a month in a different year is two
            taps rather than twelve, and the chart says which year it is drawing. */}
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5">
            <button
              className="focus-ring grid h-6 w-6 place-items-center rounded-md text-text-tertiary transition-colors duration-200 ease-out hover:bg-subtle hover:text-text-primary"
              type="button"
              aria-label={`Show ${year - 1}`}
              onClick={() => onPeriodChange(shiftPeriodMonth(periodMonth, -12))}
            >
              <ChevronLeft size={13} strokeWidth={2} />
            </button>
            <span className="text-[11px] font-medium tabular-nums text-text-secondary">{year}</span>
            <button
              className="focus-ring grid h-6 w-6 place-items-center rounded-md text-text-tertiary transition-colors duration-200 ease-out hover:bg-subtle hover:text-text-primary"
              type="button"
              aria-label={`Show ${year + 1}`}
              onClick={() => onPeriodChange(shiftPeriodMonth(periodMonth, 12))}
            >
              <ChevronRight size={13} strokeWidth={2} />
            </button>
          </div>
          <span className="truncate text-[11px] text-text-tertiary">
            {MONTH_SHORT[monthIndex]}{" "}
            <span className={cn("font-medium tabular-nums", short ? "text-danger" : "text-text-secondary")}>
              {short ? "−" : "+"}
              {formatCurrency(Math.abs(month.leftOver))}
            </span>
          </span>
        </div>

        <div className="grid grid-cols-12 gap-[3px]">
          {months.map((entry, index) => {
            const height = (Math.abs(entry.leftOver) / scale) * 50;
            const deficit = entry.leftOver < 0;
            const selected = index === monthIndex;

            return (
              <button
                key={index}
                className={cn(
                  "focus-ring rounded-[7px] px-0.5 pb-0.5 pt-1 transition-colors duration-200 ease-out",
                  selected ? "bg-accent-soft" : "hover:bg-subtle"
                )}
                type="button"
                aria-label={`${MONTH_SHORT[index]} ${year}, ${
                  deficit ? "short" : "left over"
                } ${formatCurrency(Math.abs(entry.leftOver))}`}
                aria-current={selected ? "true" : undefined}
                onClick={() => onMonthIndexChange(index)}
              >
                <span className="relative block h-8 w-full">
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
                {/* Spelled out, not initialled. Twelve single letters with two Js,
                    two Ms and two As is a puzzle, not a label. */}
                <span
                  className={cn(
                    "mt-1 block text-center text-[9px] leading-none",
                    selected ? "font-semibold text-text-primary" : "text-text-tertiary"
                  )}
                >
                  {MONTH_SHORT[index]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

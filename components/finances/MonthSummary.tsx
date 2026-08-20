"use client";

import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import { SECTION_STYLE, shareOfIncome } from "@/lib/finances";
import type { MonthFinances } from "@/types/finance";

/**
 * What the month came to: the net, what came in, what went out, and the split.
 *
 * Three peer figures at the same size — an earlier version set the net two steps
 * larger than the other two, which asked the reader why the type kept changing
 * size. The emphasis is **colour**, the way every other financial report does it:
 * green in surplus, red in deficit. That is also the only cue needed for the sign,
 * so the label says "Left over" or "Short" and the figure stays unsigned.
 */
export function MonthSummary({ month }: { month: MonthFinances }) {
  const short = month.leftOver < 0;
  const outgoing = month.sections.filter((section) => section.direction === "out");
  const spokenFor = outgoing.reduce((sum, section) => sum + section.total, 0);
  const unallocated = Math.max(0, month.moneyIn - spokenFor);

  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      <div className="grid grid-cols-3 divide-x divide-border/70">
        {[
          {
            label: short ? "Short" : "Left over",
            value: month.leftOver,
            tone: short ? "bad" : "good"
          },
          { label: "Money in", value: month.moneyIn, tone: "plain" },
          { label: "Money out", value: month.moneyOut, tone: "plain" }
        ].map((stat) => (
          <div key={stat.label} className="min-w-0 px-3 py-2.5">
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
      </div>

      {month.moneyIn > 0 && spokenFor > 0 ? (
        <div className="border-t border-border/70 px-3 py-2.5">
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
    </section>
  );
}

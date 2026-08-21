"use client";

import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import type { MonthFinances } from "@/types/finance";

/**
 * What the month came to: the net, what came in, what went out.
 *
 * Three peer figures at the same size — an earlier version set the net two steps
 * larger, which asked the reader why the type kept changing size. The emphasis is
 * **colour**, the way every other financial report does it: green in surplus, red
 * in deficit. That is also the only cue needed for the sign, so the label says
 * "Left over" or "Short" and the figure stays unsigned.
 *
 * **Fixed height, always.** This card and the month picker are the page's header
 * pair, sitting in one grid row, and a header that changes height moves the
 * control next to it. A composition bar used to live under these figures and
 * appeared only once something had been allocated — so the picker beside it
 * jumped by 50px depending on the month being viewed. The share of income each
 * block takes is on the block's own row in the breakdown, which is where you are
 * looking when you want it.
 */

// 60px, matched by MonthPicker's panel variant. Both header cards are pinned to
// it so neither can shift the other, whatever their contents.
const HEADER_CARD_HEIGHT = "h-[60px]";

export function MonthSummary({ month }: { month: MonthFinances }) {
  const short = month.leftOver < 0;

  // In, then what is already promised, then what survives — the order the
  // question gets asked. "Committed" rather than "money out": nothing occasional
  // is ever typed into Finances, so every figure here is something that repeats
  // whether anybody thinks about it or not, and that is the point of the page.
  const stats = [
    { label: "Money in", value: month.moneyIn, tone: "plain" },
    { label: "Committed", value: month.moneyOut, tone: "plain" },
    { label: short ? "Short" : "Left over", value: month.leftOver, tone: short ? "bad" : "good" }
  ];

  return (
    <section
      className={cn(
        "grid grid-cols-3 divide-x divide-border/70 overflow-hidden rounded-[20px] border border-border bg-surface shadow-card",
        HEADER_CARD_HEIGHT
      )}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="flex min-w-0 flex-col justify-center px-3">
          <div className="truncate text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
            {stat.label}
          </div>
          <div
            className={cn(
              "mt-1 truncate text-[17px] font-medium leading-none tracking-[-0.01em]",
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

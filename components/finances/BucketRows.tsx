"use client";

import { Link2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import { SECTION_STYLE, shareOfIncome } from "@/lib/finances";
import type { FinanceRow, FinanceSection } from "@/types/finance";

/**
 * Where the month's money went.
 *
 * This card exists to answer one question — what is taking the money, and what
 * would be worth going after first — and three earlier versions answered a
 * different one instead. What they got wrong is worth keeping written down:
 *
 * - **Money in and money out looked identical.** Same type, same rows, tinted
 *   strips a shade apart. A reader landing on a line could not tell whether the
 *   figure was a good thing or a bad thing, which is the very first thing a
 *   number on this page has to say. Income now reads in green and closes with a
 *   green total; everything that leaves is neutral and carries its share of what
 *   came in.
 * - **The block total sat above its lines.** People read a group of items and
 *   then its conclusion — a receipt, an invoice and a bank statement all work
 *   that way. A total on top is a claim you have to hold in your head while
 *   checking the lines under it. The total is now the last row of its block,
 *   heavier and tinted, and it is where the block's name lives.
 * - **The bars measured the wrong thing.** They were scaled against the biggest
 *   line inside each block, so a $2.10 line looked enormous in a block holding
 *   nothing else, and no two blocks were comparable. Nobody could say what the
 *   length meant, and a picture that has to be decoded is worse than no picture.
 *   Every bar and every percentage on this card is now one thing — **share of the
 *   month's money in** — named once at the top of the card, on one scale, so
 *   Needs at 20% is visibly a fifth of everything earned and visibly four times
 *   OR Income Tax at 5%.
 *
 * Lines stay biggest-first (`sectionOf`), which is the order that answers "what
 * should I go after". Nothing is behind a tap: the lines are the point.
 */

function SourceBadge({ source }: { source: FinanceRow["source"] }) {
  if (source === "Manual") return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-subtle px-1.5 py-px text-[9.5px] font-medium text-text-tertiary">
      <Link2 size={9} strokeWidth={2} />
      {source}
    </span>
  );
}

/** The two right-hand columns every row shares, so all of them read down one edge. */
const SHARE_COLUMN = "w-[34px] shrink-0 text-right tabular-nums";
const FIGURE_COLUMN = "w-[86px] shrink-0 text-right tabular-nums sm:w-[96px]";

/**
 * A share as a percentage, or nothing at all.
 *
 * Under half a percent rounds to "0%", which says less than an empty space does —
 * the $1.56 beside it has already made the point.
 */
function sharePercent(share: number) {
  return share >= 0.005 ? `${Math.round(share * 100)}%` : "";
}

export function BucketRows({ sections, moneyIn }: { sections: FinanceSection[]; moneyIn: number }) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      {/* Names the percentages once, for the whole card. Without this the reader
          is left guessing what each share is a share of — which is exactly how
          the previous version failed. Nothing on the left: the first block here
          is the money coming in, so a "where it goes" caption over the top of it
          would be describing the wrong thing. */}
      <div className="flex items-center justify-end border-b border-border bg-surface px-3 py-1.5 sm:px-3.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
          Share of money in
        </span>
      </div>

      <div className="divide-y-2 divide-border">
        {sections.map((section) => {
          const style = SECTION_STYLE[section.key];
          const income = section.direction === "in";
          const share = shareOfIncome(section.total, moneyIn);

          return (
            <div key={section.key}>
              {section.rows.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center gap-2.5 border-b border-border/40 px-3 py-1.5 sm:px-3.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-text-secondary">{row.label}</span>
                    {/* Under the name: where the figure came from if it was not
                        typed, and the hint where it explains itself — that a
                        month is blended across a raise, that a stay was three
                        nights, that a premium is quarterly. */}
                    {row.hint || row.source !== "Manual" ? (
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                        <SourceBadge source={row.source} />
                        {row.hint ? (
                          <span className="truncate text-[10.5px] leading-tight text-text-tertiary">{row.hint}</span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                  <span className={cn(SHARE_COLUMN, "text-[11px] text-text-tertiary")}>
                    {sharePercent(shareOfIncome(row.amount, moneyIn))}
                  </span>
                  <span
                    className={cn(FIGURE_COLUMN, "text-[13px]", income ? "text-[#3F7A5E]" : "text-text-primary")}
                  >
                    {formatCurrency(row.amount)}
                  </span>
                </div>
              ))}

              {/* The block's conclusion, and the only place its name appears: the
                  lines come first and the total closes them off. The bar is the
                  percentage printed beside it, on the same 0–100%-of-money-in
                  scale as every other block. */}
              <div
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 sm:px-3.5",
                  income ? "bg-[#EDF3EE]" : "bg-[#F4F2EC]"
                )}
              >
                <span
                  aria-hidden
                  className={cn("h-4 w-1.5 shrink-0 rounded-full", style.color, section.total === 0 && "opacity-30")}
                />
                <h2
                  className={cn(
                    "min-w-0 shrink truncate text-[14.5px] font-medium tracking-[-0.01em]",
                    income ? "text-[#2F6B4F]" : "text-text-primary"
                  )}
                >
                  {style.title}
                </h2>
                {/* The bar takes whatever is left of the row. On a phone there is
                    nothing left, and the percentage carries it alone. */}
                <span className="hidden min-w-0 flex-1 sm:block" aria-hidden>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-border/50">
                    <span
                      className={cn("block h-full rounded-full", style.color)}
                      style={{ width: `${Math.min(1, share) * 100}%` }}
                    />
                  </span>
                </span>
                <span className="flex-1 sm:hidden" />
                <span className={cn(SHARE_COLUMN, "text-[11.5px] font-medium text-text-secondary")}>
                  {sharePercent(share)}
                </span>
                <span
                  className={cn(
                    FIGURE_COLUMN,
                    "text-[14.5px] font-medium",
                    income ? "text-[#2F6B4F]" : "text-text-primary"
                  )}
                >
                  {formatCurrency(section.total)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

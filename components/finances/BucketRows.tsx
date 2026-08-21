"use client";

import { Link2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import { SECTION_STYLE, shareOfIncome } from "@/lib/finances";
import type { FinanceRow, FinanceSection } from "@/types/finance";

/**
 * The six blocks and what is inside each of them.
 *
 * The lines are **not** behind a tap. They were for a version, on the reasoning
 * that a total is what you read and the detail is optional — which is backwards:
 * you scan the totals to find the one that looks wrong, and the moment you find
 * it you want the lines that explain it, without a click and without losing the
 * others from view. Hiding them turns a breakdown into a quiz.
 *
 * But nineteen figures in one card is only readable if the eye is given a
 * structure to travel along, and the first version gave it none: every number
 * within a point of the same size, section totals barely heavier than the lines
 * under them, each amount ending wherever its own row happened to end, and the
 * lines in the order somebody typed them. It read as a list of numbers rather
 * than an answer. Three things fix that, and none of them is hiding data:
 *
 * 1. **One column for every figure.** Section totals and line amounts share a
 *    fixed right-hand column, so all nineteen sit on one edge and the eye runs
 *    down them instead of hunting left and right. The share of income sits in
 *    its own column too, above the bars, so nothing floats.
 * 2. **A heading outranks its lines.** 15px primary against 13px secondary,
 *    with the block's colour and a tinted strip. You can find the block you want
 *    without reading a word of it.
 * 3. **Every line is filled to its own size**, against the biggest line in its
 *    block. Which line dominates a block is a question about proportion, and a
 *    proportion is answered by a length far faster than by comparing digits.
 *    Ordering is biggest-first (`sectionOf`), so the fills step down the block
 *    and the two lines that matter are always the top two.
 *
 *    It sits on the row's second line, next to the hint, and not in a column of
 *    its own: a column wide enough to read cost 58px of the label beside it,
 *    which at 390px turned "OR Statewide Transit Tax (Ivan)" into "OR Statewide
 *    Transit Tax (I…", and a label you cannot read is worse than a proportion you
 *    cannot see. Filling the row's background instead was tried and was worse
 *    again — a 16% tint of olive on off-white is not a length you can measure,
 *    and a fill that stops halfway across a row reads as a rendering fault
 *    rather than as a quantity. Every bar starts on the same left edge, so their
 *    ends can be compared down the block.
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

/** Every figure in the card ends on this edge — section totals included. */
const FIGURE_COLUMN = "w-[86px] shrink-0 text-right tabular-nums sm:w-[96px]";

export function BucketRows({ sections, moneyIn }: { sections: FinanceSection[]; moneyIn: number }) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      <div className="divide-y divide-border">
        {sections.map((section) => {
          const style = SECTION_STYLE[section.key];
          const income = section.direction === "in";
          const share = shareOfIncome(section.total, moneyIn);
          // Against the biggest line in this block, not against the month: what
          // is being asked here is which line dominates the block in front of
          // you, and every block should therefore have one full bar.
          const largest = Math.max(...section.rows.map((row) => row.amount), 0);

          return (
            <div key={section.key}>
              <div
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 sm:px-3.5",
                  income ? "bg-[#EFF3EE]" : "bg-[#F4F2EC]"
                )}
              >
                <span
                  aria-hidden
                  className={cn("h-4 w-1.5 shrink-0 rounded-full", style.color, section.total === 0 && "opacity-30")}
                />
                <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-[-0.01em] text-text-primary">
                  {style.title}
                </h2>
                {share > 0 && !income ? (
                  <span className="shrink-0 text-[11px] tabular-nums text-text-tertiary">
                    {Math.round(share * 100)}%
                  </span>
                ) : null}
                <span className={cn(FIGURE_COLUMN, "text-[15px] font-medium text-text-primary")}>
                  {formatCurrency(section.total)}
                </span>
              </div>

              {/* An empty block is its header row and nothing else — the $0.00
                  already says it, and five "nothing here" rows do not. */}
              {section.rows.length > 0 ? (
                <div className="divide-y divide-border/50">
                  {section.rows.map((row) => (
                    <div key={row.key} className="flex items-center gap-2.5 px-3 py-1.5 sm:px-3.5">
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <span className="truncate text-[13px] text-text-secondary">{row.label}</span>
                          <SourceBadge source={row.source} />
                        </span>
                        {/* The bar, then the hint — the hint is where a figure
                            explains itself, that a month is blended across a
                            raise, that a stay was three nights, that a premium is
                            quarterly, and it is the reason to look at a breakdown
                            at all. Sharing this line means the proportion costs
                            no height on the rows that carry one. */}
                        <span className="mt-1 flex min-w-0 items-center gap-2">
                          <span className="block h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-border/50">
                            <span
                              className={cn("block h-full rounded-full", style.color)}
                              style={{ width: `${largest > 0 ? (row.amount / largest) * 100 : 0}%` }}
                            />
                          </span>
                          {row.hint ? (
                            <span className="truncate text-[10.5px] leading-tight text-text-tertiary">
                              {row.hint}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className={cn(FIGURE_COLUMN, "text-[13px] text-text-primary")}>
                        {formatCurrency(row.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

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
 * One card, divided. Each block is a header row with its share of income, and its
 * lines beneath in lighter type.
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

export function BucketRows({ sections, moneyIn }: { sections: FinanceSection[]; moneyIn: number }) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      <div className="divide-y divide-border">
        {sections.map((section) => {
          const style = SECTION_STYLE[section.key];
          const income = section.direction === "in";
          const share = shareOfIncome(section.total, moneyIn);

          return (
            <div key={section.key}>
              <div
                className={cn(
                  "flex items-center gap-2.5 px-3 py-1.5",
                  income ? "bg-[#F6F8F5]" : "bg-[#FAFAF7]"
                )}
              >
                <span
                  aria-hidden
                  className={cn("h-3.5 w-1 shrink-0 rounded-full", style.color, section.total === 0 && "opacity-30")}
                />
                <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">{style.title}</h2>
                {!income && share > 0 ? (
                  <span className="shrink-0 text-[10.5px] tabular-nums text-text-tertiary">
                    {Math.round(share * 100)}%
                  </span>
                ) : null}
                <span className="shrink-0 text-[13.5px] font-medium tabular-nums text-text-primary">
                  {formatCurrency(section.total)}
                </span>
              </div>

              {/* An empty block is its header row and nothing else — the $0.00
                  already says it, and five "nothing here" rows do not. */}
              {section.rows.length > 0 ? (
                <div className="divide-y divide-border/50">
                  {section.rows.map((row) => (
                    <div key={row.key} className="flex items-start gap-2.5 px-3 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-1.5">
                          <span className="truncate text-[12.5px] text-text-secondary">{row.label}</span>
                          <SourceBadge source={row.source} />
                        </span>
                        {/* The hint is where a figure explains itself — that a
                            month is blended across a raise, that a stay was three
                            nights, that a premium is quarterly. It is the reason
                            to look at a breakdown at all, so it stays on screen. */}
                        {row.hint ? (
                          <span className="mt-px block truncate text-[10.5px] leading-tight text-text-tertiary">
                            {row.hint}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[12.5px] tabular-nums text-text-primary">
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

"use client";

import { useState } from "react";
import { ChevronDown, Link2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import { SECTION_STYLE, shareOfIncome } from "@/lib/finances";
import type { FinanceRow, FinanceSection } from "@/types/finance";

/**
 * The six blocks of the month, as six rows in one card.
 *
 * They were six stacked cards, which cost six borders, six shadows, six titles
 * and twelve lots of padding to say what six 44px rows say — about 900px of
 * scroll for something that now reads in 280px. A block's lines are the detail
 * behind its total, so they open underneath it on tap instead of being on screen
 * permanently.
 *
 * No card title. The rows name themselves, and the nav already says Finances.
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

function LineRow({ row }: { row: FinanceRow }) {
  return (
    <div className="flex items-start gap-2.5 py-1">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-[13px]",
              row.informational ? "text-text-tertiary" : "text-text-secondary"
            )}
          >
            {row.label}
          </span>
          <SourceBadge source={row.source} />
        </div>
        {row.hint ? <div className="truncate text-[11px] text-text-tertiary">{row.hint}</div> : null}
      </div>
      <span
        className={cn(
          "shrink-0 text-[13px] font-medium tabular-nums",
          row.informational ? "text-text-tertiary" : "text-text-primary"
        )}
      >
        {formatCurrency(row.amount)}
      </span>
    </div>
  );
}

export function BucketRows({ sections, moneyIn }: { sections: FinanceSection[]; moneyIn: number }) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      <div className="divide-y divide-border/70">
        {sections.map((section) => {
          const style = SECTION_STYLE[section.key];
          const open = openKey === section.key;
          const income = section.direction === "in";
          const share = shareOfIncome(section.total, moneyIn);

          return (
            <div key={section.key} className={cn(income && "bg-[#FAFAF7]")}>
              <button
                className="focus-ring flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors duration-200 ease-out hover:bg-subtle/60"
                type="button"
                aria-expanded={open}
                onClick={() => setOpenKey(open ? null : section.key)}
              >
                <span
                  aria-hidden
                  className={cn("h-6 w-1 shrink-0 rounded-full", style.color, section.total === 0 && "opacity-30")}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-text-primary">{style.title}</span>
                  {/* The share bar sits under the name, using the width the row
                      has anyway rather than a column of its own. */}
                  {!income && share > 0 ? (
                    <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-subtle">
                      <span
                        className={cn("block h-full rounded-full transition-all duration-200 ease-out", style.color)}
                        style={{ width: `${share * 100}%` }}
                      />
                    </span>
                  ) : null}
                </span>
                {!income && share > 0 ? (
                  <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-text-tertiary">
                    {Math.round(share * 100)}%
                  </span>
                ) : null}
                <span
                  className={cn(
                    "shrink-0 text-right tabular-nums",
                    income ? "text-[15px] font-medium text-text-primary" : "text-[14.5px] text-text-primary"
                  )}
                >
                  {formatCurrency(section.total)}
                </span>
                <ChevronDown
                  size={15}
                  strokeWidth={1.8}
                  className={cn("shrink-0 text-text-tertiary transition-transform duration-200 ease-out", open && "rotate-180")}
                />
              </button>

              {open ? (
                <div className="border-t border-border/60 bg-subtle/40 px-3.5 py-2">
                  {section.rows.length === 0 ? (
                    <div className="py-1 text-[12.5px] text-text-tertiary">
                      Nothing set up yet — add it in Setup.
                    </div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {section.rows.map((row) => (
                        <LineRow key={row.key} row={row} />
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

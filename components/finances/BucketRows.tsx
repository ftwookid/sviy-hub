"use client";

import { Link2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCurrency, formatCurrencyRounded } from "@/lib/formatters";
import { SECTION_STYLE, shareOfIncome } from "@/lib/finances";
import type { FinanceRow, FinanceSection } from "@/types/finance";

/**
 * The month: what came in, what is already committed, and what a year of it costs.
 *
 * What this card is for decides its shape, and the shape only settled once the
 * purpose did: **Finances tracks recurring commitments, not spending.** Nothing
 * occasional is ever typed here — no restaurants, no one-off trips. Every line is
 * something that repeats whether anybody thinks about it or not, so the questions
 * worth answering are how much of the month is already promised before it starts,
 * and which commitment is worth killing.
 *
 * That is why the card reads the way it does:
 *
 * - **One composition bar at the top.** Committed money by block, then what is
 *   left, on a single 100%-of-income track. It is the whole month in one line
 *   before a figure is read, and it is the only place proportion is drawn —
 *   thirteen little bars, one per row, were noise (and measured against the wrong
 *   thing besides).
 * - **A yearly figure against every commitment.** $14.99 a month is a shrug;
 *   $180 a year is a decision. The run rate is what makes somebody cancel
 *   something, so it sits under every outflow line and on every block's total,
 *   rounded, because it is an extrapolation and not an amount anybody was
 *   charged.
 * - **Money in is green, and everything committed is neutral.** A reader landing
 *   on a line has to be able to tell whether the figure is a good thing before
 *   reading what it says.
 * - **Lines first, then their conclusion.** People read a group of items and then
 *   its total — a receipt, an invoice, a statement all work that way. Each
 *   block's total is its last row, heavier, tinted, and it is the only place the
 *   block's name appears.
 * - **Biggest first** (`sectionOf`), which is the order that answers "what should
 *   I go after". Setup keeps `sort_order`: that screen is for finding a line by
 *   name.
 *
 * Every percentage on the card is one thing — share of the month's money in —
 * named once in the header. Bars scaled per-block against their own biggest line
 * were the previous version and told the reader nothing they could act on.
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

/** Under half a percent rounds to "0%", which says less than an empty space does. */
function sharePercent(share: number) {
  return share >= 0.005 ? `${Math.round(share * 100)}%` : "";
}

function yearly(amount: number) {
  return `${formatCurrencyRounded(amount * 12)} a year`;
}

export function BucketRows({ sections, moneyIn }: { sections: FinanceSection[]; moneyIn: number }) {
  const outflows = sections.filter((section) => section.direction === "out");
  const committed = outflows.reduce((sum, section) => sum + section.total, 0);
  const free = Math.max(0, moneyIn - committed);

  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      {/* The month in one line. Each committed block takes its share of the track
          and what survives closes it, so "how much of this month was spoken for
          before it started" is answered before any figure is read. */}
      {moneyIn > 0 ? (
        <div className="px-3 pb-2 pt-2.5 sm:px-3.5">
          <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-subtle">
            {outflows
              .filter((section) => section.total > 0)
              .map((section) => (
                <span
                  key={section.key}
                  className={cn("block h-full", SECTION_STYLE[section.key].color)}
                  style={{ width: `${(section.total / moneyIn) * 100}%` }}
                  title={SECTION_STYLE[section.key].title}
                />
              ))}
            <span className="block h-full flex-1 bg-success/85" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[11px] text-text-tertiary">
              {sharePercent(shareOfIncome(committed, moneyIn))} committed · {formatCurrency(committed)}
            </span>
            <span className="shrink-0 text-[11px] text-success">
              {sharePercent(shareOfIncome(free, moneyIn))} left over · {formatCurrency(free)}
            </span>
          </div>
        </div>
      ) : null}

      {/* Names the percentages once, for the whole card. Without it the reader is
          left guessing what each share is a share of. */}
      <div className="flex items-center justify-end border-y border-border bg-surface px-3 py-1 sm:px-3.5">
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
              {section.rows.map((row) => {
                // The yearly run rate, and whatever the figure needs to say about
                // itself — that a month is blended across a raise, that a stay
                // was three nights, that a premium is quarterly.
                const notes = [row.hint, income ? null : yearly(row.amount)].filter(Boolean) as string[];

                return (
                  <div
                    key={row.key}
                    className="flex items-center gap-2.5 border-b border-border/40 px-3 py-1.5 sm:px-3.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-text-secondary">{row.label}</span>
                      {notes.length > 0 || row.source !== "Manual" ? (
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                          <SourceBadge source={row.source} />
                          <span className="truncate text-[10.5px] leading-tight text-text-tertiary">
                            {notes.join(" · ")}
                          </span>
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
                );
              })}

              {/* The block's conclusion, and the only place its name appears. */}
              <div
                className={cn(
                  "flex items-center gap-2.5 px-3 py-1.5 sm:px-3.5",
                  income ? "bg-[#EDF3EE]" : "bg-[#F4F2EC]"
                )}
              >
                <span
                  aria-hidden
                  className={cn("h-4 w-1.5 shrink-0 rounded-full", style.color, section.total === 0 && "opacity-30")}
                />
                <span className="min-w-0 flex-1">
                  <h2
                    className={cn(
                      "truncate text-[14.5px] font-medium tracking-[-0.01em]",
                      income ? "text-[#2F6B4F]" : "text-text-primary"
                    )}
                  >
                    {style.title}
                  </h2>
                  {!income && section.total > 0 ? (
                    <span className="block truncate text-[10.5px] leading-tight text-text-tertiary">
                      {yearly(section.total)}
                    </span>
                  ) : null}
                </span>
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

"use client";

import { Link2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCurrency, formatCurrencyRounded } from "@/lib/formatters";
import { SECTION_STYLE } from "@/lib/finances";
import type { FinanceRow, FinanceSection } from "@/types/finance";

/**
 * One block as its own small table — the way the household's own spreadsheet had
 * it for years, and it reads better than the single divided list it replaced.
 *
 * The list version kept losing the same argument. Nineteen rows under one roof
 * meant a block boundary was a hairline and a tint, so a figure told you nothing
 * about *what kind* of figure it was until you traced upward to find its
 * heading — and no amount of type hierarchy inside one card fixed that. A card
 * per block, with the block's colour across its head, answers "what am I looking
 * at" from three feet away, and the colour is the same one the block wears in the
 * ring, so the two read as one picture.
 *
 * Structure, following the spreadsheet exactly: the coloured head names the
 * block, the lines come next, and the **total closes the card** — items then
 * conclusion, like every receipt and invoice ever printed.
 *
 * Yearly run rates sit under each line and on the total, because the point of
 * this page is deciding what to keep paying for: $23 a month is a shrug, $276 a
 * year is a decision. They are rounded — a run rate is an extrapolation, not an
 * amount anybody was charged.
 */

function SourceBadge({ source }: { source: FinanceRow["source"] }) {
  if (source === "Manual") return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-subtle px-1.5 py-px text-[9px] font-medium text-text-tertiary">
      <Link2 size={8} strokeWidth={2} />
      {source}
    </span>
  );
}

export function BlockCard({ section, share }: { section: FinanceSection; share?: string }) {
  const style = SECTION_STYLE[section.key];
  const income = section.direction === "in";
  const empty = section.rows.length === 0;

  return (
    <section className="overflow-hidden rounded-[16px] border border-border bg-surface shadow-card">
      <header className="flex items-baseline gap-2 px-3 py-[7px]" style={{ background: style.hex }}>
        <h2 className="min-w-0 flex-1 truncate text-[12.5px] font-medium tracking-[0.01em] text-white">
          {style.title}
        </h2>
        {/* An empty block carries its zero here and stops — see below. */}
        {empty ? (
          <span className="shrink-0 text-[11.5px] tabular-nums text-white/80">{formatCurrency(0)}</span>
        ) : share ? (
          <span className="shrink-0 text-[11px] tabular-nums text-white/75">{share}</span>
        ) : null}
      </header>

      {/* A block with nothing in it is its head and nothing else. Spelled out as
          a body plus a $0.00 total it was 150px of chrome saying zero, four times
          over on a phone — but it still has to be visible, because it is where a
          line gets added and a household with no Debt block would never think to
          look for one. */}
      {empty ? null : (
        <div className="divide-y divide-border/40">
          {section.rows.map((row) => {
            const notes = [row.hint, income ? null : `${formatCurrencyRounded(row.amount * 12)} a year`].filter(
              Boolean
            ) as string[];

            return (
              <div key={row.key} className="flex items-center gap-2 px-3 py-1">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-text-secondary">{row.label}</span>
                  {notes.length > 0 || row.source !== "Manual" ? (
                    <span className="flex min-w-0 items-center gap-1">
                      <SourceBadge source={row.source} />
                      <span className="truncate text-[10px] leading-tight text-text-tertiary">
                        {notes.join(" · ")}
                      </span>
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-right text-[12.5px] tabular-nums",
                    income ? "text-[#3F7A5E]" : "text-text-primary"
                  )}
                >
                  {formatCurrency(row.amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* The conclusion. Tinted, heavier, and last. */}
      {empty ? null : (
      <div className="flex items-center gap-2 border-t border-border bg-subtle/70 px-3 py-1.5">
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-medium text-text-primary">Total</span>
          {/* Not on a one-line block: the line above it already carries the same
              yearly figure, and printing it twice makes a reader check whether
              the two numbers differ. */}
          {!income && section.total > 0 && section.rows.length > 1 ? (
            <span className="block text-[10px] leading-tight text-text-tertiary">
              {formatCurrencyRounded(section.total * 12)} a year
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "shrink-0 text-[13.5px] font-medium tabular-nums",
            income ? "text-[#2F6B4F]" : "text-text-primary"
          )}
        >
          {formatCurrency(section.total)}
        </span>
      </div>
      )}
    </section>
  );
}

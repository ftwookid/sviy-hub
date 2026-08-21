"use client";

import { formatCurrency, formatCurrencyRounded } from "@/lib/formatters";
import { SECTION_STYLE } from "@/lib/finances";
import type { FinanceSection } from "@/types/finance";

/**
 * Money out, as one ring.
 *
 * The household kept this exact picture in a spreadsheet for years, which is the
 * best argument for it there is: a ring answers "what is the shape of this month"
 * in one glance, before any number is read, and it is the only chart on the page
 * that compares every block against every other on the same footing. The legend
 * carries the figures, because a ring on its own cannot answer "how much" —
 * slices are labelled with their share and the amount sits beside them.
 *
 * Slices are **money out only**. A ring that also contains what is left over is
 * a picture of the whole month rather than of the spending, and it makes the
 * biggest slice the one nobody wants to act on.
 *
 * Ring and legend sit side by side where the card has the screen's width and
 * stack inside the desktop column, which is about 300px — squeezed beside the
 * ring there, "Tax withheld" truncated to "T…". The `lg:` on the stacked layout
 * looks backwards and is not: it is the container that narrows at `lg`, not the
 * viewport.
 */

const RADIUS = 42;
const STROKE = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function OutRing({ sections }: { sections: FinanceSection[] }) {
  const slices = sections
    .filter((section) => section.direction === "out" && section.total > 0)
    .sort((a, b) => b.total - a.total);
  const total = slices.reduce((sum, slice) => sum + slice.total, 0);

  let rotation = -90;

  return (
    <section className="rounded-[20px] border border-border bg-surface p-3 shadow-card">
      <h2 className="mb-1.5 px-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
        Money out
      </h2>

      {total === 0 ? (
        <p className="px-0.5 pb-1 text-[12.5px] text-text-tertiary">Nothing going out this month.</p>
      ) : (
        <div className="flex items-center gap-3.5 lg:flex-col lg:items-stretch lg:gap-2.5">
          <div className="relative h-[112px] w-[112px] shrink-0 lg:mx-auto">
            <svg viewBox="0 0 100 100" className="h-full w-full">
              {slices.map((slice) => {
                const length = (slice.total / total) * CIRCUMFERENCE;
                const arc = (
                  <circle
                    key={slice.key}
                    cx="50"
                    cy="50"
                    r={RADIUS}
                    fill="none"
                    stroke={SECTION_STYLE[slice.key].hex}
                    strokeWidth={STROKE}
                    strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                    transform={`rotate(${rotation} 50 50)`}
                  />
                );
                rotation += (slice.total / total) * 360;
                return arc;
              })}
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-[15px] font-medium leading-none tabular-nums text-text-primary">
                  {formatCurrencyRounded(total)}
                </div>
                <div className="mt-0.5 text-[9px] uppercase tracking-[0.06em] text-text-tertiary">a month</div>
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-[3px] lg:flex-none">
            {slices.map((slice) => (
              <div key={slice.key} className="flex items-baseline gap-1.5">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: SECTION_STYLE[slice.key].hex }}
                />
                <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary">
                  {SECTION_STYLE[slice.key].title}
                </span>
                <span className="w-[30px] shrink-0 text-right text-[11px] tabular-nums text-text-tertiary">
                  {Math.round((slice.total / total) * 100)}%
                </span>
                <span className="w-[76px] shrink-0 text-right text-[12px] tabular-nums text-text-primary">
                  {formatCurrency(slice.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

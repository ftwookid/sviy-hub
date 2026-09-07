import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Several figures, one set of chrome.
 *
 * The house pattern for a row of numbers is a divided strip, never a grid of
 * cards: a card per figure charges a border, a shadow, an icon badge and two
 * lots of padding for one number, and on a phone that stacks into a screen of
 * scroll before a single total is read.
 *
 * This is the wrapping version of `StatStrip` — where that one is a single row
 * of three, this reflows from two columns to six and keeps the rules correct at
 * every count. It does that by painting the divider colour on the container and
 * letting a 1px grid gap show it through, rather than by putting borders on the
 * cells: cell borders have to know which items end a row, and a row that wraps
 * differently at another breakpoint gets it wrong.
 */
export function FigureGrid({ columns, children }: { columns: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-[20px] border border-border bg-border shadow-card",
        columns
      )}
    >
      {children}
    </div>
  );
}

export function Figure({
  label,
  value,
  detail,
  aside
}: {
  label: string;
  value: string;
  /** The short fact under the figure. Omitted rather than left blank. */
  detail?: string;
  /** A badge that shares the detail's line — a delta, a tone. */
  aside?: ReactNode;
}) {
  return (
    <div className="min-w-0 bg-surface px-2.5 py-2.5 sm:px-3">
      <div className="truncate text-caption font-medium uppercase tracking-[0.05em] text-text-tertiary">{label}</div>
      {/* The figure gets the cell's whole width. Sharing the line with a badge
          is what clipped "$2,821.00" to "$2,821...." in a 152px column, and a
          truncated number is worse than no number because it still looks like
          one. */}
      <div className="mt-1 truncate text-figure font-semibold leading-none tracking-[-0.01em] text-text-primary">
        {value}
      </div>
      {detail || aside ? (
        <div className="mt-1.5 flex items-baseline gap-1.5">
          {detail ? <span className="min-w-0 flex-1 truncate text-caption text-text-tertiary">{detail}</span> : null}
          {/* ml-auto rather than a growing spacer, so the badge sits on the
              cell's right edge whether or not a detail sits beside it. */}
          {aside ? <span className="ml-auto shrink-0">{aside}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

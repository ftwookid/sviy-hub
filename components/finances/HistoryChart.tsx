"use client";

import { Fragment } from "react";
import { cn } from "@/lib/cn";
import { periodMonthShortLabel } from "@/lib/expenses";
import { formatCurrency } from "@/lib/formatters";
import { OUT_INK } from "@/components/finances/chart";
import type { FinanceHistoryPoint } from "@/types/finance";

/**
 * A line's timeline — **turned on its side**, so time runs down the page.
 *
 * This is the fourth attempt and the first one that cannot fail, so the three
 * before it are worth keeping written down. All three were horizontal charts,
 * and every one of them broke on the same wall: a phone gives a plot about 260px
 * of width, and a year needs twelve figures in it.
 *
 * 1. **A shape**, with only the high and the low labelled. Ivan opened the water
 *    bill and could not read anything off it.
 * 2. **A figure on every dot, scrolling sideways** to make room. A chart you have
 *    to drag is a chart you cannot take in, and the two months you want to
 *    compare are never both on screen.
 * 3. **Thinned and staggered figures.** Thinning meant some months had no number
 *    at all. Staggering was worse than that: to keep a label clear of the line it
 *    was placed above or below its own neighbourhood, which **decoupled a
 *    label's height from its value** — so $114 could sit higher on the plot than
 *    $121. A chart whose positions disagree with its own numbers is not a hard
 *    chart to read, it is a wrong one.
 *
 * The mistake underneath all three was fighting for horizontal room the screen
 * does not have. This app's own space rules already say what to do about that,
 * about the Reports breakdown and again about `YearList`: **rows rather than
 * columns — twelve labelled columns on a phone are unreadable.** So the axis
 * that was crowded now runs **down** the page, where a phone has as much room as
 * it needs and scrolling is the natural motion rather than a fight.
 *
 * What that buys, all of it structural rather than tuned:
 *
 * - **Every month is present.** One row each, no thinning, ever.
 * - **Every figure is exact, to the cent**, in a column with one right edge.
 *   There is no rounding to make a label fit, because a label cannot collide
 *   with anything.
 * - **Nothing can lie.** A row's position is its date and its printed figure is
 *   its value; the dot is a *relative* cue laid across the row, so there is no
 *   way for a label to end up higher than a bigger number.
 * - **The shape survives.** The dots trace the same line the horizontal chart
 *   drew, read top to bottom — a rise is dots marching right as you scroll down.
 *
 * Oldest at the top, newest at the bottom: time flows down, so "creeping up" is
 * dots moving right as you read down, which is the direction anybody would
 * guess. The default range is twelve rows, which fits a phone screen whole.
 */

/** One month. Fixed, because the connecting line is drawn against it. */
const ROW = 30;

/** How far off each end of the track the extremes sit, so a dot is never on the edge. */
const INSET = 9;

/** The two side columns. The middle is what is left, and the line is drawn across it. */
const LABEL_COLUMN = 72;
const FIGURE_COLUMN = 82;

type Group = { label: string | null; points: FinanceHistoryPoint[] };

/** A boundary the timeline breaks at, and names — a move, in the `By home` reading. */
export type ChartMark = { periodMonth: string; label: string };

/**
 * The rows, cut into named runs.
 *
 * A move is a **break in the series**, not a line drawn across one: the months
 * either side of it were paid at different addresses, and joining them with a
 * stroke says they are one run of the same thing. So each home gets its own
 * heading and its own connected line, and the gap between them is the move.
 */
function grouped(points: FinanceHistoryPoint[], marks?: ChartMark[]): Group[] {
  if (!marks || marks.length === 0) return [{ label: null, points }];

  const starts = [...marks].sort((a, b) => a.periodMonth.localeCompare(b.periodMonth));
  const groups: Group[] = [];

  points.forEach((point) => {
    let label: string | null = null;
    starts.forEach((mark) => {
      if (mark.periodMonth <= point.periodMonth) label = mark.label;
    });
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.points.push(point);
    else groups.push({ label, points: [point] });
  });

  return groups;
}

export function HistoryChart({
  points,
  marks,
  periodMonth
}: {
  points: FinanceHistoryPoint[];
  marks?: ChartMark[];
  /** The month the panel was opened for. Its row is marked, so "now" is findable in a long list. */
  periodMonth?: string;
}) {
  if (points.length < 2) return null;

  const amounts = points.map((point) => point.amount);
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  const flat = high === low;

  /** Where a figure sits across the track, as a percentage. Position, not length. */
  const at = (amount: number) => (flat ? 50 : INSET + ((amount - low) / (high - low)) * (100 - INSET * 2));

  const groups = grouped(points, marks);

  return (
    <div className="px-3.5 pb-3 pt-1 sm:px-4">
      {/* What the track spans, named once at the top. Every row prints its own
          figure, so this is orientation rather than a scale anybody has to
          read against — which is why it is two words and not an axis. */}
      <div
        className="flex items-baseline justify-between pb-1 text-micro tabular-nums text-text-tertiary"
        style={{ marginLeft: LABEL_COLUMN, marginRight: FIGURE_COLUMN }}
      >
        <span>{formatCurrency(low)}</span>
        {flat ? null : <span>{formatCurrency(high)}</span>}
      </div>

      {groups.map((group, groupIndex) => (
        <Fragment key={group.label ?? `run-${groupIndex}`}>
          {group.label ? (
            <div className="border-t border-border pb-1 pt-2 text-caption font-medium text-text-secondary">
              {group.label}
            </div>
          ) : null}

          <div className="relative" style={{ height: group.points.length * ROW }}>
            {/* The line, across the track column only. Its viewBox is the
                track's own percentage space, so it passes exactly through the
                dots the rows place — there is no second coordinate system to
                fall out of step with, which is the bug that cost the horizontal
                chart a whole release. */}
            {/* The SVG is stretched by a wrapper rather than by its own `left`
                and `right`: an `<svg>` is a replaced element, so `width: auto`
                resolves to its intrinsic 300px and the box quietly stops
                matching the track — which put the line 130px wide next to dots
                spread across 170. A block wrapper takes the geometry and the
                SVG fills it. */}
            <span
              aria-hidden
              className="absolute inset-y-0 block"
              style={{ left: LABEL_COLUMN, right: FIGURE_COLUMN }}
            >
              <svg
                className="h-full w-full"
                viewBox={`0 0 100 ${group.points.length * ROW}`}
                preserveAspectRatio="none"
              >
                <polyline
                  points={group.points
                    .map((point, index) => `${at(point.amount).toFixed(2)},${index * ROW + ROW / 2}`)
                    .join(" ")}
                  fill="none"
                  stroke={OUT_INK}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </span>

            {group.points.map((point, index) => {
              const now = point.periodMonth === periodMonth;
              return (
                <div
                  key={point.periodMonth}
                  className={cn("absolute inset-x-0 flex items-center rounded-lg", now ? "bg-subtle" : null)}
                  style={{ top: index * ROW, height: ROW }}
                >
                  <span
                    className={cn(
                      "shrink-0 truncate pl-1 text-meta tabular-nums",
                      now ? "font-medium text-text-primary" : "text-text-secondary"
                    )}
                    style={{ width: LABEL_COLUMN }}
                  >
                    {periodMonthShortLabel(point.periodMonth)}
                  </span>

                  <span className="relative min-w-0 flex-1">
                    <span
                      aria-hidden
                      className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                      style={{ left: `${at(point.amount)}%`, background: OUT_INK }}
                    />
                  </span>

                  <span
                    className={cn(
                      "shrink-0 pr-1 text-right text-list tabular-nums",
                      now ? "font-semibold text-text-primary" : "text-text-primary"
                    )}
                    style={{ width: FIGURE_COLUMN }}
                  >
                    {formatCurrency(point.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

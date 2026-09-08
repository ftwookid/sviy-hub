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
 *
 * Two things were added after Ivan read the first rotated version:
 *
 * - **A leader across every row.** The dot sits somewhere in the middle of a
 *   ~170px track with the month name to its left and the figure to its right,
 *   and with nothing joining the three there was a beat of work in tying a dot
 *   to the number it stands for — his words: "I don't see any line connecting
 *   the chart from the left side of December 2025 to a number 112". A hairline
 *   runs the width of the track behind the dot, touching both columns, so the
 *   eye is carried label → dot → figure without ever leaving the row. It is one
 *   step off the surface, well under the polyline it crosses, because it is
 *   there to be followed and not to be looked at.
 * - **The average, drawn and toned.** A faint vertical rule stands at the mean
 *   of the months on screen, and each dot and figure takes a muted tone for
 *   which side of it that month fell. This is the one place in the app where
 *   colour carries a reading, so it is **redundant rather than load-bearing**:
 *   the rule is drawn, so above-average is a position before it is a colour, and
 *   the exact figure is printed either way. The two tones are the app's own
 *   `success` and `danger`, which are already muted.
 */

/** One month. Fixed, because the connecting line is drawn against it. */
const ROW = 30;

/** How far off each end of the track the extremes sit, so a dot is never on the edge. */
const INSET = 9;

/** The two side columns. The middle is what is left, and the line is drawn across it. */
const LABEL_COLUMN = 72;
const FIGURE_COLUMN = 82;

/** The leader, and the average rule. One step off the surface — followed, not read. */
const LEADER = "#EDEAE3";
const AVERAGE_RULE = "#D4D1CB";

/**
 * The two tones, straight off the palette.
 *
 * `success` and `danger` are already desaturated — #4A8C6F and #9B3A3A — which
 * is what Ivan asked for ("really small, not bright, really nicely integrated").
 * Nothing brighter is needed, because the tone is never the only thing saying
 * which side of the average a month fell on.
 */
const GOOD_INK = "#4A8C6F";
const BAD_INK = "#9B3A3A";

/** Within a cent of the mean is *at* the average, which reads as fine, not as over. */
const AT_AVERAGE = 0.01;

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
  periodMonth,
  direction = "out"
}: {
  points: FinanceHistoryPoint[];
  marks?: ChartMark[];
  /** The month the panel was opened for. Its row is marked, so "now" is findable in a long list. */
  periodMonth?: string;
  /**
   * Which way the money goes. A month above the average is bad news on a
   * commitment and good news on income, so the tone follows the block the line
   * sits in rather than the sign — the same rule the `Change` stat follows.
   */
  direction?: "in" | "out";
}) {
  if (points.length < 2) return null;

  const amounts = points.map((point) => point.amount);
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  const flat = high === low;

  /** Where a figure sits across the track, as a percentage. Position, not length. */
  const at = (amount: number) => (flat ? 50 : INSET + ((amount - low) / (high - low)) * (100 - INSET * 2));

  /**
   * The average of what is on screen, not of the whole history — the reading is
   * "which of these months was over", and the months being compared are the ones
   * in front of the reader.
   */
  const mean = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  const meanAt = at(mean);

  /** Above the average, or at it. At it is fine — Ivan's rule, and the kind one. */
  const inkFor = (amount: number) => {
    if (flat) return OUT_INK;
    const above = amount - mean > AT_AVERAGE;
    return above === (direction === "in") ? GOOD_INK : BAD_INK;
  };

  const groups = grouped(points, marks);

  /**
   * The `avg` caption is only worth printing where it clears the two ends of the
   * scale. Squeezed against the low or the high it would overprint one of them,
   * and the rule under it says the same thing on its own.
   */
  const showMeanLabel = !flat && meanAt > 26 && meanAt < 74;

  return (
    <div className="px-3.5 pb-3 pt-1 sm:px-4">
      {/* What the track spans, named once at the top, with the average named
          where it stands. Every row prints its own figure, so this is
          orientation rather than a scale anybody has to read against — which is
          why it is three words and not an axis. */}
      <div
        className="relative flex items-baseline justify-between pb-1 text-micro tabular-nums text-text-tertiary"
        style={{ marginLeft: LABEL_COLUMN, marginRight: FIGURE_COLUMN }}
      >
        <span>{formatCurrency(low)}</span>
        {showMeanLabel ? (
          <span className="absolute -translate-x-1/2 text-text-tertiary" style={{ left: `${meanAt}%` }}>
            avg
          </span>
        ) : null}
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
                {flat ? null : (
                  <line
                    x1={meanAt}
                    x2={meanAt}
                    y1={0}
                    y2={group.points.length * ROW}
                    stroke={AVERAGE_RULE}
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
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
              const ink = inkFor(point.amount);
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
                    {/* The leader: what carries the eye from the month to the
                        dot to the figure. It runs a few pixels into both
                        columns so the row reads as one thing rather than as
                        three. */}
                    <span
                      aria-hidden
                      className="absolute top-1/2 block h-px -translate-y-1/2"
                      style={{ left: -5, right: -5, background: LEADER }}
                    />
                    <span
                      aria-hidden
                      className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                      style={{ left: `${at(point.amount)}%`, background: ink }}
                    />
                  </span>

                  <span
                    className={cn(
                      "shrink-0 pr-1 text-right text-list tabular-nums",
                      now ? "font-semibold" : null
                    )}
                    style={{ width: FIGURE_COLUMN, color: ink }}
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

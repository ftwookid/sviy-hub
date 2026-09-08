"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { periodMonthShortLabel } from "@/lib/expenses";
import {
  formatCurrency,
  formatCurrencyRounded,
  parseLocalDate,
} from "@/lib/formatters";
import { OUT_INK } from "@/components/finances/chart";
import type { FinanceHistoryPoint } from "@/types/finance";

/**
 * A line's timeline: every month, every amount, on the mark.
 *
 * The first version was a shape with two annotations — the high and the low
 * labelled, the rest of the months left to the reader's eye and to a table
 * further down. Ivan opened the water bill and could not read anything off it,
 * which is the only verdict that counts: a chart in this app is not decoration
 * over a table, it **is** how the figures are read. So it is now an ordinary
 * plotted chart and it obeys the ordinary rules of one.
 *
 * - **A labelled Y axis**, on round steps, in a fixed gutter that does not
 *   scroll away.
 * - **An X axis naming every month**, with the year under the first column of
 *   each one.
 * - **A dot on every month, and its amount printed directly above the dot.**
 *   The house data-viz rule says never a number on every point; that rule is
 *   about a dense series where the labels become a wall, and it gives way to an
 *   explicit request on a series of at most 24 points that a person reads one
 *   month at a time. It is what the panel is opened for.
 *
 * **Which is why it scrolls sideways.** A phone gives the plot about 330px. An
 * amount needs ~45px of that and a month name ~28px, so a column cannot be
 * narrower than about 60px without the labels colliding — 24 months is 1,440px
 * and there is no arrangement of a 390px screen that shows them all with their
 * figures on. Something had to give, and it is not the figures: the chart opens
 * **scrolled to the right**, on the months just gone, and older ones are a swipe
 * away. That is the same shape as the Mileage bar chart, which reached the same
 * conclusion for the same reason.
 *
 * The Y gutter sits outside the scroller, so the scale stays put while the
 * months move under it.
 */

/**
 * Room per month — the floor, and how it grows.
 *
 * A column has to hold whichever is wider, the amount above the dot or the month
 * name under it, plus a gap. A flat 62px was set to the worst case and made a
 * seven-month water bill scroll when it would have fitted on the screen whole,
 * so it is measured off the widest label the chart actually carries: roughly
 * 6.3px a character at 11px, plus breathing room, never under 44.
 */
const MIN_COLUMN = 44;

function columnWidth(labels: string[]) {
  const longest = labels.reduce(
    (widest, label) => Math.max(widest, label.length),
    0,
  );
  return Math.max(MIN_COLUMN, Math.round(longest * 6.3 + 12));
}

/** The plot's own height, gridlines and all. */
const PLOT = 178;

/**
 * Space above the top gridline for the highest point's own label.
 *
 * A point sitting on the top of the scale still has its figure printed above it,
 * so this is a label's height plus its gap plus air — at 20px the two touched on
 * a line that ran near the top of its band.
 */
const TOP = 26;

/** A little air under the bottom gridline. */
const BOTTOM = 8;

/** The gutter the Y axis labels sit in, left of the scroller. */
const GUTTER = 52;

/** About this many gridlines; the round step decides the exact count. */
const TICKS = 5;

/**
 * A scale on round numbers.
 *
 * The axis is the data's band rounded outwards to a step a person recognises —
 * 80/100/120/140/160 rather than 96.12/108.9/121.7/134.5/147.3. It is **not**
 * forced to zero: a bar encodes by length so cropping one lies, but a line reads
 * by slope, and a zero-based axis on a bill that moves between $101 and $131
 * draws it flat across the top of the plot and hides the drift the panel exists
 * to show. The crop is stated rather than assumed — every gridline carries its
 * value, and every point carries its own.
 */
function niceScale(low: number, high: number) {
  if (!(high > low)) {
    // A line that never moved. Zero to a round step above it, so the flat line
    // sits in the plot with something to measure it against.
    const top = high > 0 ? high : 1;
    return ticksBetween(0, top, Math.max(top / 2, 0.01));
  }

  const rough = (high - low) / (TICKS - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10]
      .map((factor) => factor * magnitude)
      .find((size) => size >= rough) ?? magnitude * 10;
  return ticksBetween(
    Math.floor(low / step) * step,
    Math.ceil(high / step) * step,
    step,
  );
}

function ticksBetween(min: number, max: number, step: number) {
  const values: number[] = [];
  for (let value = min; value <= max + step / 1000; value += step) {
    values.push(Math.round(value * 100) / 100);
  }
  return { min, max, values };
}

/**
 * How exact a printed figure is.
 *
 * **Whole dollars, unless the money is small enough that the cents are most of
 * it.** `$74.35` on every one of twenty-four points is 42px of label in a column
 * that then cannot be narrower than 54 — and 35 cents is not what anybody opens
 * this panel to find out; the `Month by month` list underneath carries every
 * figure to the cent. Below $10 the rule flips, because `$3` for a $2.99
 * subscription is a third of a dollar out on a chart made of that one number.
 *
 * One switch, made once per chart off the top of the scale, so a gridline and a
 * point are never rounded differently.
 */
function figureFormat(max: number) {
  return max < 10 ? formatCurrency : formatCurrencyRounded;
}

export function HistoryChart({ points }: { points: FinanceHistoryPoint[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  // Which edge has months hidden behind it. A clipped line at the edge of a card
  // is not a cue anybody reads as "there is more" — a fade is, and it has to be
  // measured rather than assumed, or the chart would advertise history it does
  // not have.
  const [hidden, setHidden] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    setHidden({
      left: element.scrollLeft > 2,
      right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2,
    });
  }, []);

  // Opens on the months just gone. The reader came from a row showing this
  // month's figure, so that is where the chart has to start; the past is behind
  // it, in the direction a thumb already swipes.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    element.scrollLeft = element.scrollWidth;
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, points]);

  if (points.length < 2) return null;

  const amounts = points.map((point) => point.amount);
  const scale = niceScale(Math.min(...amounts), Math.max(...amounts));
  const span = scale.max - scale.min || 1;
  const band = PLOT - TOP - BOTTOM;
  const y = (amount: number) => TOP + (1 - (amount - scale.min) / span) * band;

  const format = figureFormat(scale.max);
  const columns = `repeat(${points.length}, minmax(0, 1fr))`;
  const minWidth =
    points.length * columnWidth(points.map((point) => format(point.amount)));

  return (
    <div className="px-3.5 pb-3 pt-3.5 sm:px-4">
      <div className="flex">
        {/* The scale, outside the scroller, so it holds still while the months
            move under it. */}
        <div
          className="relative shrink-0"
          style={{ width: GUTTER, height: PLOT }}
          aria-hidden
        >
          {scale.values.map((value) => (
            <span
              key={value}
              className="absolute right-2 -translate-y-1/2 text-caption tabular-nums text-text-tertiary"
              style={{ top: y(value) }}
            >
              {format(value)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div ref={scroller} onScroll={measure} className="overflow-x-auto">
            <div
              className="relative"
              style={{ minWidth, height: PLOT }}
              role="img"
              aria-label={points
                .map(
                  (point) =>
                    `${periodMonthShortLabel(point.periodMonth)} ${formatCurrency(point.amount)}`,
                )
                .join(", ")}
            >
              {/* Hairlines, solid and one step off the surface — never dashed. */}
              {scale.values.map((value) => (
                <span
                  key={value}
                  aria-hidden
                  className="absolute inset-x-0 h-px bg-border"
                  style={{ top: y(value) }}
                />
              ))}

              {/* The line, and only the line. Its x units are columns, so the
                stretch is horizontal and `non-scaling-stroke` keeps the 2px
                honest; y is already in the plot's own pixels, so nothing
                vertical is distorted. */}
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${points.length} ${PLOT}`}
                preserveAspectRatio="none"
                aria-hidden
              >
                <polyline
                  points={points
                    .map(
                      (point, index) =>
                        `${index + 0.5},${y(point.amount).toFixed(2)}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke={OUT_INK}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              {/* One cell per month, so a dot and its figure centre on the same
                column the X axis names underneath. */}
              <div
                className="absolute inset-0 grid"
                style={{ gridTemplateColumns: columns }}
              >
                {points.map((point) => (
                  <div key={point.periodMonth} className="relative">
                    <span
                      aria-hidden
                      className="absolute left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                      style={{ top: y(point.amount), background: OUT_INK }}
                    />
                    <span
                      className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-caption font-medium tabular-nums text-text-primary"
                      style={{ bottom: PLOT - y(point.amount) + 9 }}
                    >
                      {format(point.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* The X axis. The year is named once per year rather than on every
              column, where twelve repetitions of "2026" would be the only thing
              the eye could see. */}
            <div
              className="mt-2 grid border-t border-border pt-1.5"
              style={{ gridTemplateColumns: columns, minWidth }}
            >
              {points.map((point, index) => {
                const date = parseLocalDate(point.periodMonth);
                const opensYear = index === 0 || date.getMonth() === 0;
                return (
                  <div key={point.periodMonth} className="text-center">
                    <div className="text-caption text-text-secondary">
                      {periodMonthShortLabel(point.periodMonth).split(" ")[0]}
                    </div>
                    <div className="text-micro text-text-tertiary">
                      {opensYear ? date.getFullYear() : " "}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {hidden.left ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-surface via-surface/80 to-transparent"
            />
          ) : null}
          {hidden.right ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface via-surface/80 to-transparent"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Every figure again, as text, to the cent.
 *
 * The chart carries them all now, so this is no longer the only place a value
 * can be read — but it is still the place the **cents** can be, since the plot
 * rounds anything over $100 to keep its labels inside a 62px column. It is also
 * the twin that reads without scrolling sideways.
 *
 * Two columns filled **downwards**, the way `YearList` learned to: a CSS grid
 * fills row by row by default, which would put the newest month beside the
 * second-newest and make the reader zig-zag to follow a sequence.
 */
export function HistoryTable({ points }: { points: FinanceHistoryPoint[] }) {
  if (points.length === 0) return null;
  const rows = [...points].reverse();
  const half = Math.ceil(rows.length / 2);

  return (
    <div
      className="grid grid-flow-col gap-x-5 px-3.5 pb-3 pt-2.5 sm:px-4"
      style={{
        gridTemplateRows: `repeat(${half}, minmax(0, auto))`,
        gridTemplateColumns: "1fr 1fr",
      }}
    >
      {rows.map((point) => (
        <div
          key={point.periodMonth}
          className="flex items-baseline justify-between gap-2 py-[3px]"
        >
          <span className="truncate text-meta text-text-secondary">
            {periodMonthShortLabel(point.periodMonth)}
          </span>
          <span className="shrink-0 text-meta tabular-nums text-text-primary">
            {formatCurrency(point.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

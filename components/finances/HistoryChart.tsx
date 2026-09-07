"use client";

import { cn } from "@/lib/cn";
import { periodMonthShortLabel } from "@/lib/expenses";
import { formatCurrency, formatCurrencyRounded } from "@/lib/formatters";
import { monthsBetween } from "@/lib/financeHistory";
import { OUT_INK } from "@/components/finances/chart";
import type { FinanceHistoryPoint } from "@/types/finance";

/**
 * A line's timeline — two years of one figure, read without touching anything.
 *
 * **Everything is on the first screen.** No hover, no tap, no crosshair: this is
 * used on a phone, where a hover does not exist, and the one thing a reader
 * wants is the shape plus the numbers at the ends of it. So the scale is printed
 * in the left gutter, the high and the low are marked where they happened, the
 * span is named under the plot, and every single figure is listed underneath in
 * `HistoryTable`. Nothing is gated behind an interaction.
 *
 * **The scale is the data's own band, and it says so.** The utility grid's bars
 * run from zero and must — a bar encodes a quantity by its *length*, so cropping
 * one exaggerates the difference between two lengths. A line encodes by position
 * and reads by slope, and a zero-based axis on a bill that moves between $101
 * and $131 draws a flat line across the top of the plot: it hides the very drift
 * this panel exists to show. The honest version of a cropped axis is a **stated**
 * one, so the top and bottom of the band are drawn as hairlines with their
 * values beside them rather than left to be assumed.
 *
 * The drawing follows the house spec: one hue (the card's title names the
 * series, so no legend), a 2px line, markers at 8px, hairline rules one step off
 * the surface, no gridlines beyond the two that carry the scale, and a value on
 * an extreme rather than on every point.
 *
 * **Why HTML dots over an SVG line.** The plot is full-width and its height is
 * fixed, so the SVG stretches — `preserveAspectRatio="none"` — which keeps the
 * stroke honest via `non-scaling-stroke` but would squash a `<circle>` into an
 * ellipse and a `<text>` into a smear. The line is the only thing in the SVG;
 * the dots and every label are ordinary elements positioned at a percentage, so
 * they stay round and crisp at any width.
 */

/**
 * The band above the high mark and below the low one.
 *
 * It is 20% rather than just enough to keep a marker from clipping, because it
 * is where the two month captions go — and **no data can reach it**, which is
 * exactly why they go there. The first version put each caption just inside its
 * marker, where the line runs, and grey 11px over a 2px gold stroke is
 * unreadable; the second put it on a surface chip, which was legible and cut a
 * white gap through the line at its own peak. Nothing above the high rule or
 * below the low one is ever drawn, so out there a caption needs neither a
 * backing nor a compromise.
 */
const PAD = 20;

/** Points at or under this many get a dot each; past it the line would read as a comb. */
const DOTS_UP_TO = 14;

/** The gutter the two scale figures sit in, left of the plot. */
const GUTTER = 56;

type Placed = FinanceHistoryPoint & { x: number; y: number };

/** Where a label sits relative to its point, so nothing runs off either end. */
function anchor(x: number) {
  if (x < 14) return { transform: "translateX(0)", align: "text-left" };
  if (x > 86) return { transform: "translateX(-100%)", align: "text-right" };
  return { transform: "translateX(-50%)", align: "text-center" };
}

/**
 * How exact the two scale figures are.
 *
 * Rounded is right for a run rate and for a bill in the hundreds, and wrong for
 * a $2.99 subscription, where `formatCurrencyRounded` prints `$3` — a third of a
 * dollar out, on the only figure the chart carries. The switch is made once per
 * chart off the high mark, so the two rules are never one rounded and one not.
 */
function axisFormat(high: number) {
  return high >= 100 ? formatCurrencyRounded : formatCurrency;
}

function ScaleRule({ y, value, format }: { y: number; value: number; format: (value: number) => string }) {
  return (
    <>
      <span
        aria-hidden
        className="absolute right-0 h-px bg-border"
        style={{ left: GUTTER, top: `${y}%` }}
      />
      <span
        className="absolute left-0 -translate-y-1/2 pr-2 text-right text-caption tabular-nums text-text-tertiary"
        style={{ top: `${y}%`, width: GUTTER }}
      >
        {format(value)}
      </span>
    </>
  );
}

/** A marker: 8px, filled, with a 2px surface ring so it reads over the line it sits on. */
function Dot({ point, emphasis }: { point: Placed; emphasis?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 rounded-full",
        emphasis ? "h-2 w-2 ring-2 ring-surface" : "h-1.5 w-1.5"
      )}
      style={{ left: `${point.x}%`, top: `${point.y}%`, background: OUT_INK }}
    />
  );
}

/**
 * The month an extreme happened in, hung off its own marker.
 *
 * The *value* is already on the rule the marker sits on, so this says only the
 * thing the rule cannot. The high's caption sits **above** its marker and the
 * low's **below** its own — out in the empty bands, clear of the line, and a
 * whole plot apart from each other. Near either end the caption stops centring
 * itself and tucks against the edge instead, so a January peak does not hang off
 * the left of the card.
 */
function ExtremeLabel({ point, below }: { point: Placed; below: boolean }) {
  const { transform, align } = anchor(point.x);
  return (
    <span
      className={cn("absolute whitespace-nowrap text-caption text-text-tertiary", align)}
      style={{
        left: `${point.x}%`,
        top: below ? `calc(${point.y}% + 8px)` : undefined,
        bottom: below ? undefined : `calc(${100 - point.y}% + 8px)`,
        transform
      }}
    >
      {periodMonthShortLabel(point.periodMonth)}
    </span>
  );
}

export function HistoryChart({ points }: { points: FinanceHistoryPoint[] }) {
  if (points.length < 2) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const amounts = points.map((point) => point.amount);
  const high = Math.max(...amounts);
  const low = Math.min(...amounts);
  const flat = high === low;

  // Positioned by **time, not by index**: a utility with no bill in March has to
  // show a longer stretch of line across it, not two adjacent months.
  const span = monthsBetween(first.periodMonth, last.periodMonth) || 1;
  const placed: Placed[] = points.map((point) => ({
    ...point,
    x: (monthsBetween(first.periodMonth, point.periodMonth) / span) * 100,
    y: flat ? 50 : PAD + (1 - (point.amount - low) / (high - low)) * (100 - PAD * 2)
  }));

  const format = axisFormat(high);
  const highPoint = placed.find((point) => point.amount === high)!;
  const lowPoint = placed.find((point) => point.amount === low)!;
  const line = placed.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  /** The two months the axis row already spells out. */
  const named = new Set([first.periodMonth, last.periodMonth]);

  return (
    <div className="px-3.5 pb-3 pt-3.5 sm:px-4">
      <div
        // A line that never moved does not need the room a moving one does, and
        // 188px of white under a straight rule reads as a chart that failed to
        // load rather than as "nothing happened".
        className={flat ? "relative h-[96px]" : "relative h-[188px]"}
        role="img"
        aria-label={
          flat
            ? `Unchanged at ${formatCurrency(high)} from ${periodMonthShortLabel(first.periodMonth)} to ${periodMonthShortLabel(last.periodMonth)}.`
            : `From ${periodMonthShortLabel(first.periodMonth)} to ${periodMonthShortLabel(last.periodMonth)}: highest ${formatCurrency(high)} in ${periodMonthShortLabel(highPoint.periodMonth)}, lowest ${formatCurrency(low)} in ${periodMonthShortLabel(lowPoint.periodMonth)}, latest ${formatCurrency(last.amount)}. Every month is listed below.`
        }
      >
        {flat ? (
          <ScaleRule y={50} value={high} format={format} />
        ) : (
          <>
            <ScaleRule y={PAD} value={high} format={format} />
            <ScaleRule y={100 - PAD} value={low} format={format} />
          </>
        )}

        <div className="absolute inset-y-0 right-0" style={{ left: GUTTER }}>
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <polyline
              points={line}
              fill="none"
              stroke={OUT_INK}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {placed.length <= DOTS_UP_TO
            ? placed.map((point) => <Dot key={point.periodMonth} point={point} />)
            : null}
          {flat ? null : (
            <>
              <Dot point={highPoint} emphasis />
              <Dot point={lowPoint} emphasis />
              {/* An extreme that falls on the first or last month is already
                  named by the axis row directly underneath it, and the caption
                  landed a few pixels above its own duplicate. */}
              {named.has(highPoint.periodMonth) ? null : <ExtremeLabel point={highPoint} below={false} />}
              {named.has(lowPoint.periodMonth) ? null : <ExtremeLabel point={lowPoint} below />}
            </>
          )}
          <Dot point={placed[placed.length - 1]} emphasis />
        </div>
      </div>

      {/* The span, named at both ends. Two labels rather than a tick per month:
          twelve month names across 274px is a smear, and every month is printed
          in full directly underneath. */}
      <div
        className="mt-2 flex items-baseline justify-between text-caption text-text-tertiary"
        style={{ marginLeft: GUTTER }}
      >
        <span>{periodMonthShortLabel(first.periodMonth)}</span>
        <span>{periodMonthShortLabel(last.periodMonth)}</span>
      </div>
    </div>
  );
}

/**
 * Every figure on the chart, as text.
 *
 * The chart's twin, and not an afterthought: a plot answers "which way is this
 * going" and cannot answer "what exactly was March", which is the question a
 * paper bill in your hand raises. It is also what makes the whole panel readable
 * without seeing colour or hitting a 8px target.
 *
 * Two columns filled **downwards**, the way `YearList` learned to: a CSS grid
 * fills row by row by default, which would put the oldest month beside the
 * second-oldest and make the reader zig-zag to follow a sequence.
 */
export function HistoryTable({ points }: { points: FinanceHistoryPoint[] }) {
  if (points.length === 0) return null;
  const rows = [...points].reverse();
  const half = Math.ceil(rows.length / 2);

  return (
    <div
      className="grid grid-flow-col gap-x-5 px-3.5 pb-3 pt-2.5 sm:px-4"
      style={{ gridTemplateRows: `repeat(${half}, minmax(0, auto))`, gridTemplateColumns: "1fr 1fr" }}
    >
      {rows.map((point) => (
        <div key={point.periodMonth} className="flex items-baseline justify-between gap-2 py-[3px]">
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

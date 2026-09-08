"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { periodMonthShortLabel } from "@/lib/expenses";
import { formatCurrency, formatCurrencyRounded, parseLocalDate } from "@/lib/formatters";
import { OUT_INK } from "@/components/finances/chart";
import type { FinanceHistoryPoint } from "@/types/finance";

/**
 * A line's timeline: every month, and as many of the amounts as will fit.
 *
 * Two rewrites got here and both are worth keeping written down.
 *
 * The first was a *shape* — the high and the low annotated, every other month
 * left to the eye and to a table further down, on the house rule that a number
 * on every point is a wall. Ivan opened the water bill and could not read
 * anything off it. That rule is about a dense series; this is a handful of
 * points a person reads one month at a time, and reading a month off it is what
 * the panel is opened for.
 *
 * The second put a figure on every dot and **scrolled sideways** to make room.
 * That was worse in the way that matters: a chart you have to drag is a chart
 * you cannot take in, and the two months you want to compare are never both on
 * screen. So the chart now **always fits**, and what gives instead is label
 * density — the range control above decides how many months are in view, and the
 * chart decides how many of them can carry a figure. Twelve months, the default,
 * carries all twelve.
 *
 * How it fits, in order:
 *
 * 1. **Measure**, rather than assume. This plot is 500px inside a desktop dialog
 *    and about 260px on a phone; a fixed column width is wrong on one of them by
 *    construction.
 * 2. **Stagger** the figures above and below the line once a column is narrower
 *    than a label. That doubles the room each one gets, for the price of a
 *    narrower band to draw in.
 * 3. **Thin** them — every second, every third — when even staggering is not
 *    enough, counting back from the newest month so the one the reader arrived
 *    from always carries a figure. `Month by month` underneath still has every
 *    one of them, to the cent.
 * 4. **Thin the month names** the same way, and fall back to naming only the
 *    years when a column is too narrow for `Sep`.
 * 5. **Shrink the dots**, and past the point where they would merge into the
 *    line, draw one only where there is a figure to attach it to.
 */

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

/** Air under the bottom gridline — enough for a staggered label when there is one. */
const BOTTOM_PLAIN = 8;
const BOTTOM_STAGGERED = 28;

/** The gutter the Y axis labels sit in, left of the plot. */
const GUTTER = 50;

/** About this many gridlines; the round step decides the exact count. */
const TICKS = 5;

/** Roughly one character at `text-caption`, and the air a label wants around it. */
const CHAR = 6.3;
const LABEL_AIR = 8;

/** A month name is not worth printing in less room than this. */
const MONTH_LABEL = 22;

/** Once month names would have to be thinned past this, the axis names years instead. */
const MONTH_GIVE_UP = 3;

/** `useLayoutEffect`, except on the server, where React warns about it. */
const useMeasureEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A scale on round numbers.
 *
 * The axis is the data's band rounded outwards to a step a person recognises —
 * 80/100/120/140/160 rather than 96.12/108.9/121.7/134.5/147.3. It is **not**
 * forced to zero: a bar encodes by length so cropping one lies, but a line reads
 * by slope, and a zero-based axis on a bill that moves between $101 and $131
 * draws it flat across the top of the plot and hides the drift the panel exists
 * to show. The crop is stated rather than assumed — every gridline carries its
 * value.
 */
function niceScale(low: number, high: number) {
  if (!(high > low)) {
    const top = high > 0 ? high : 1;
    return ticksBetween(0, top, Math.max(top / 2, 0.01));
  }

  const rough = (high - low) / (TICKS - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((size) => size >= rough) ?? magnitude * 10;
  return ticksBetween(Math.floor(low / step) * step, Math.ceil(high / step) * step, step);
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
 * Whole dollars, unless the money is small enough that the cents are most of it.
 * `$74.35` is 42px of label where `$74` is 25, and 35 cents is not what anybody
 * opens this panel to find out — `Month by month` underneath carries every
 * figure to the cent. Below $10 the rule flips, because `$3` for a $2.99
 * subscription is a third of a dollar out on a chart made of that one number.
 * One switch per chart, so a gridline and a point are never rounded differently.
 */
function figureFormat(max: number) {
  return max < 10 ? formatCurrency : formatCurrencyRounded;
}

/** A boundary worth drawing down the plot — a move, in the `By home` reading. */
export type ChartMark = { periodMonth: string; label: string };

export function HistoryChart({ points, marks }: { points: FinanceHistoryPoint[]; marks?: ChartMark[] }) {
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useMeasureEffect(() => {
    const element = plot.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [points.length]);

  if (points.length < 2) return null;

  const count = points.length;
  const amounts = points.map((point) => point.amount);
  const scale = niceScale(Math.min(...amounts), Math.max(...amounts));
  const format = figureFormat(scale.max);
  const labels = points.map((point) => format(point.amount));

  const column = width > 0 ? width / count : 0;
  const labelWidth = labels.reduce((widest, label) => Math.max(widest, label.length), 0) * CHAR + LABEL_AIR;

  const stagger = column > 0 && column < labelWidth;
  const slot = Math.max(stagger ? column * 2 : column, 1);
  const every = column > 0 ? Math.max(1, Math.ceil(labelWidth / slot)) : 1;

  const labelled = points.map((_, index) => index).filter((index) => (count - 1 - index) % every === 0);
  const labelSide = new Map(labelled.map((index, order) => [index, order % 2 === 0]));

  const bottom = stagger ? BOTTOM_STAGGERED : BOTTOM_PLAIN;
  const band = PLOT - TOP - bottom;
  const span = scale.max - scale.min || 1;
  const y = (amount: number) => TOP + (1 - (amount - scale.min) / span) * band;

  const dot = column === 0 || column >= 16 ? 8 : column >= 9 ? 6 : 0;
  const monthEvery = column > 0 ? Math.max(1, Math.ceil(MONTH_LABEL / column)) : 1;
  const showMonths = monthEvery <= MONTH_GIVE_UP;

  /**
   * The months the axis names, and where each year is anchored.
   *
   * The year used to be printed under every January whether or not that column
   * named its month, which put a lone `2024` between two named months a third of
   * a column apart — they overlapped. It now rides on a **named** column: the
   * first one of each calendar year in view, so it reads `Mar 2024` and can
   * never collide with a neighbour that is already spaced for its own label.
   * When months are given up entirely the year takes their place, at each
   * January, which is twelve columns of room.
   */
  const namedMonths = showMonths
    ? points.map((_, index) => index).filter((index) => (count - 1 - index) % monthEvery === 0)
    : [];
  const namedYears = new Map<number, number>();
  if (showMonths) {
    let previous: number | null = null;
    namedMonths.forEach((index) => {
      const year = parseLocalDate(points[index].periodMonth).getFullYear();
      if (year !== previous) namedYears.set(index, year);
      previous = year;
    });
  } else {
    points.forEach((point, index) => {
      const date = parseLocalDate(point.periodMonth);
      if (index === 0 || date.getMonth() === 0) namedYears.set(index, date.getFullYear());
    });
  }
  const namesMonth = new Set(namedMonths);

  const at = (index: number) => ((index + 0.5) / count) * 100;

  /**
   * How far a figure sits from the line, and which way.
   *
   * Not from its own point: a staggered label placed a fixed 9px under its dot
   * lands exactly where the line passes when the line is falling steeply, and
   * grey-on-gold at 11px is unreadable — the same collision that already cost
   * this chart two rewrites. It is placed clear of the **neighbourhood**
   * instead, above the highest of its own point and its two neighbours or below
   * the lowest of them, so the line can never run through it. It stays in its
   * own column, so which dot it belongs to is never in doubt.
   */
  const clearance = (index: number, above: boolean) => {
    const around = [points[index - 1], points[index], points[index + 1]]
      .filter(Boolean)
      .map((point) => y(point.amount));
    return above ? Math.min(...around) : Math.max(...around);
  };

  /** Near an edge a centred label would hang over the gutter, so it tucks in instead. */
  const sideways = (index: number) => {
    if (index === 0) return { transform: "translateX(-25%)" };
    if (index === count - 1) return { transform: "translateX(-75%)" };
    return { transform: "translateX(-50%)" };
  };
  /** Where a move falls: on the boundary *between* two months, not on a dot. */
  const markAt = (periodMonth: string) => {
    const index = points.findIndex((point) => point.periodMonth >= periodMonth);
    return index <= 0 ? null : (index / count) * 100;
  };

  return (
    <div className="px-3.5 pb-3 pt-2 sm:px-4">
      {/* Whose stretch of the line is whose, when the chart is read by home. Its
          own row above the plot rather than a label floating inside it, where it
          would fight the figures for the same few pixels. */}
      {marks && marks.length > 0 ? (
        <div className="relative mb-1 h-4" style={{ marginLeft: GUTTER }}>
          {marks.map((mark) => {
            const left = markAt(mark.periodMonth) ?? 0;
            return (
              <span
                key={`${mark.periodMonth}-${mark.label}`}
                className={cn(
                  "absolute top-0 max-w-[54%] truncate text-caption font-medium text-text-secondary",
                  left > 55 ? "-translate-x-full pr-1" : "pl-1"
                )}
                style={{ left: `${left}%` }}
              >
                {mark.label}
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="flex">
        {/* The scale sits outside the plot, so a gridline's value can never be
            drawn over by a point that lands on it. */}
        <div className="relative shrink-0" style={{ width: GUTTER, height: PLOT }} aria-hidden>
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

        <div className="min-w-0 flex-1">
          <div
            ref={plot}
            className="relative"
            style={{ height: PLOT }}
            role="img"
            aria-label={points
              .map((point) => `${periodMonthShortLabel(point.periodMonth)} ${formatCurrency(point.amount)}`)
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

            {/* A move, drawn where it happened — a step darker than the
                gridlines it crosses, because it is an annotation on the series
                rather than part of the scale. */}
            {(marks ?? []).map((mark) => {
              const left = markAt(mark.periodMonth);
              return left === null ? null : (
                <span
                  key={`${mark.periodMonth}-rule`}
                  aria-hidden
                  className="absolute top-0 w-px bg-border-emphasis"
                  style={{ left: `${left}%`, height: PLOT }}
                />
              );
            })}

            {/* The line, and only the line. Its x units are columns, so the
                stretch is horizontal and `non-scaling-stroke` keeps the 2px
                honest; y is already in the plot's own pixels, so nothing
                vertical is distorted. */}
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox={`0 0 ${count} ${PLOT}`}
              preserveAspectRatio="none"
              aria-hidden
            >
              <polyline
                points={points
                  .map((point, index) => `${index + 0.5},${y(point.amount).toFixed(2)}`)
                  .join(" ")}
                fill="none"
                stroke={OUT_INK}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {points.map((point, index) => {
              const above = labelSide.get(index);
              const top = y(point.amount);
              const carries = above !== undefined;
              const size = dot || (carries ? 6 : 0);
              return (
                <span key={point.periodMonth}>
                  {size > 0 ? (
                    <span
                      aria-hidden
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                      style={{
                        left: `${at(index)}%`,
                        top,
                        width: size,
                        height: size,
                        background: OUT_INK
                      }}
                    />
                  ) : null}
                  {carries ? (
                    <span
                      className="absolute whitespace-nowrap text-caption font-medium tabular-nums text-text-primary"
                      style={{
                        left: `${at(index)}%`,
                        ...sideways(index),
                        ...(above
                          ? { bottom: PLOT - clearance(index, true) + 9 }
                          : { top: clearance(index, false) + 9 })
                      }}
                    >
                      {labels[index]}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>

          {/* The X axis. The year is named at each January and at the first
              column — an anchor rather than a repetition, since twelve "2026"s
              would be the only thing the eye could see. */}
          <div className="relative mt-2 h-8 border-t border-border">
            {points.map((point, index) => {
              const month = namesMonth.has(index);
              const year = namedYears.get(index);
              if (!month && year === undefined) return null;
              return (
                <span
                  key={point.periodMonth}
                  className="absolute top-1.5 text-center"
                  style={{ left: `${at(index)}%`, ...sideways(index) }}
                >
                  {month ? (
                    <span className="block text-caption text-text-secondary">
                      {periodMonthShortLabel(point.periodMonth).split(" ")[0]}
                    </span>
                  ) : null}
                  {year !== undefined ? (
                    <span className="block text-micro tabular-nums text-text-tertiary">{year}</span>
                  ) : null}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Every figure again, as text, to the cent.
 *
 * The chart carries as many as fit, which on the default range is all of them —
 * but it rounds anything over $100 to keep a label inside its column, and on a
 * long range it prints every second or third. This is where the rest are, and
 * where the cents are.
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
        gridTemplateColumns: "1fr 1fr"
      }}
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

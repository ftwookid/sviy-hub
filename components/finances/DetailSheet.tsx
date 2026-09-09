"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { CloseButton } from "@/components/ui/CloseButton";
import { HistoryChart } from "@/components/finances/HistoryChart";
import { periodMonthLabel } from "@/lib/expenses";
import { formatCurrency, formatCurrencyRounded } from "@/lib/formatters";
import {
  DEFAULT_HISTORY_MONTHS,
  historySummary,
  lastMonths,
  subjectHistory,
  type HistorySources,
  type HistorySubject
} from "@/lib/financeHistory";
import { homeSpells, spellRangeLabel, type HomeSpell } from "@/lib/financeHomes";
import { useEscapeKey } from "@/lib/useEscapeKey";

/**
 * Whatever the month is opened on — a line, a block, or a whole side of it.
 *
 * The card behind this answers "what does each part of the month cost". It could
 * never answer the question that follows — **has this been creeping up** — and
 * for a metered bill or a subscription that is the only question worth asking:
 * $15 a month is a shrug, $15 that was $9 two years ago is a decision. So every
 * row on the month opens, and what it opens to leads with its timeline.
 *
 * **A panel, not a route.** Same reasoning as Setup and Utilities, and it is
 * stronger here than for either: this is opened *while* looking at a month, for
 * a glance that is over in a few seconds, and every figure it needs is already
 * in memory behind it. A page would mean a load out, a fresh set of queries for
 * data the month already holds, and a load back — for a peek. As a panel it
 * opens instantly and closing puts the reader back on exactly the row they left.
 *
 * **Everything readable, and nothing behind an interaction.** No hover, no
 * tooltip, no second tap. The timeline is a row per month rather than a
 * horizontal plot, so every month carries its own exact figure and there is no
 * separate table underneath repeating them — see `HistoryChart` for why the
 * chart is turned on its side.
 *
 * **One panel for all three levels, deliberately.** `Needs` creeping up is the
 * same question as the water bill creeping up, asked one level higher, and a
 * second panel shaped differently would say the two were different questions.
 * What tells the reader which level they opened is the panel's eyebrow and the
 * headline, not a different layout: a block reads `IN MONEY OUT · Needs`, a line
 * reads its own name and where its figure is kept.
 */

/**
 * How the timeline is being read.
 *
 * Not three spans — two spans and a **reading**. `12 months` and `All time`
 * differ only in how far back they go; `By home` is the whole history cut at
 * each move, with an average against each address, because "is it more
 * expensive to live here?" is not a question a line answers on its own. Two
 * years of a bill going up and down says nothing until the months are grouped by
 * where they were paid and each group is averaged.
 */
type Range = "recent" | "homes" | "all";

const RANGES: { key: Range; label: string }[] = [
  { key: "recent", label: "12 months" },
  { key: "homes", label: "By home" },
  { key: "all", label: "All time" }
];

/**
 * The range control: a compact pill group, not a segmented bar.
 *
 * A full-width segmented row is what the space rules call 48px of tax on every
 * visit. This is three short words at the top right of the block they govern,
 * which is where a chart's range control belongs.
 *
 * Each pill is **44px tall**, which is the floor for anything tappable and is
 * not negotiable down for being a small control: the first version measured
 * 73×30, which is a comfortable *reading* and a miss with a thumb. The house
 * trick of growing the target with padding and pulling it back with a negative
 * margin does not apply here — that is for a control painted no larger than its
 * words, and a selected pill is painted, so target and paint are the same box.
 */
function RangePicker({ value, onChange }: { value: Range; onChange: (next: Range) => void }) {
  return (
    <div className="flex items-center justify-end gap-1 px-3.5 pt-3 sm:px-4">
      <div className="flex items-center gap-0.5 rounded-2xl bg-subtle p-1">
        {RANGES.map((range) => (
          <button
            key={range.key}
            type="button"
            aria-pressed={value === range.key}
            onClick={() => onChange(range.key)}
            className={cn(
              "focus-ring inline-flex min-h-11 items-center rounded-xl px-3 text-caption font-medium transition-colors duration-200 ease-out",
              value === range.key
                ? "bg-surface text-text-primary shadow-[0_1px_2px_rgba(70,55,32,0.10)]"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            {range.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function changeLabel(change: number | null) {
  if (change === null) return "—";
  const percent = Math.round(change * 100);
  if (percent === 0) return "No change";
  return `${percent > 0 ? "+" : "−"}${Math.abs(percent)}%`;
}

/**
 * Three figures, one set of chrome — the house pattern.
 *
 * None of them repeats the chart. The high and the low are marked on the plot
 * where they happened, and this month's figure is the headline directly above,
 * so what is left is the level the line is noise around, which way it is going,
 * and what a year of it comes to.
 */
function Stats({ cells }: { cells: { label: string; value: string; tone?: "good" | "bad" }[] }) {
  return (
    <div className="grid grid-cols-3 divide-x divide-border">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 px-3.5 py-3 sm:px-4">
          <div className="truncate text-caption font-medium uppercase tracking-[0.05em] text-text-tertiary">
            {cell.label}
          </div>
          <div
            className={cn(
              "mt-1 truncate text-subhead font-semibold leading-none tracking-[-0.01em] tabular-nums",
              cell.tone === "good"
                ? "text-success"
                : cell.tone === "bad"
                  ? "text-danger"
                  : "text-text-primary"
            )}
          >
            {cell.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A block inside the one card, opened by the same tinted band the month uses. */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border">
      <h3 className="bg-subtle px-3.5 py-2.5 text-label font-semibold tracking-[-0.01em] text-text-primary sm:px-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * Each address, what it averaged, and the difference — the whole point of the
 * middle range.
 *
 * **Figures, not bars.** Comparing two or three averages is exactly the case the
 * house data-viz rules call a stat tile rather than a chart: a two-bar bar chart
 * is a bar chart with nothing to compare across, and a length beside an exact
 * number answers nothing the number does not. The difference is stated against
 * the home *before* it, which is the comparison a move actually prompts —
 * against the first home instead would answer a question nobody asks after the
 * second move.
 *
 * Newest first, because the current address is the one being asked about.
 */
function HomeComparison({ spells, direction }: { spells: HomeSpell[]; direction: "in" | "out" }) {
  if (spells.length === 0) {
    return (
      <p className="px-3.5 py-4 text-list text-text-secondary sm:px-4">
        Add the addresses you have lived at in Setup, with the day you moved in, and this reads every month
        against where you were living.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/40 px-3.5 pt-1 sm:px-4">
      {[...spells].reverse().map((spell) => {
        const percent = spell.change === null ? 0 : Math.round(spell.change * 100);
        const tone =
          spell.change === null || percent === 0
            ? null
            : percent > 0 === (direction === "in")
              ? "good"
              : "bad";
        return (
          <div key={spell.home.id} className="flex items-baseline gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label font-medium text-text-primary">
                {spell.home.name}
              </span>
              <span className="block truncate text-meta text-text-tertiary">
                {spellRangeLabel(spell)} · {spell.points.length}{" "}
                {spell.points.length === 1 ? "month" : "months"}
              </span>
            </span>
            {spell.change === null ? null : (
              <span
                className={cn(
                  "shrink-0 text-meta font-medium tabular-nums",
                  tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-text-tertiary"
                )}
              >
                {percent === 0 ? "No change" : `${percent > 0 ? "+" : "−"}${Math.abs(percent)}%`}
              </span>
            )}
            <span className="shrink-0 text-right">
              <span className="block text-subhead font-semibold tabular-nums text-text-primary">
                {formatCurrency(spell.average)}
              </span>
              <span className="block text-micro uppercase tracking-[0.05em] text-text-tertiary">a month</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Where a linked figure is actually kept, so the reader knows where to go to fix it. */
const SOURCE_NOTE: Record<NonNullable<HistorySubject["source"]>, string | null> = {
  Manual: null,
  Utilities: "Billed in Utilities",
  Clients: "From the client list",
  "House Sitting": "From the calendar"
};

export function DetailSheet({
  subject,
  periodMonth,
  sources,
  onClose
}: {
  subject: HistorySubject;
  periodMonth: string;
  sources: HistorySources;
  onClose: () => void;
}) {
  useEscapeKey(onClose);
  const direction = subject.direction;
  const [range, setRange] = useState<Range>("recent");

  // Built whole, once, and cut per range. The three stats are quoted over the
  // same twelve months whichever range is on screen — they describe the line,
  // and a figure that moved when you changed the view would be a different fact
  // wearing the same label.
  const history = useMemo(
    () => subjectHistory(subject, sources, periodMonth),
    [periodMonth, sources, subject]
  );
  const summary = useMemo(() => historySummary(history.points, periodMonth), [history.points, periodMonth]);
  const spells = useMemo(() => homeSpells(history.points, sources.homes), [history.points, sources.homes]);

  const visible = range === "recent" ? lastMonths(history.points, DEFAULT_HISTORY_MONTHS) : history.points;
  const marks =
    range === "homes"
      ? spells.map((spell) => ({
          periodMonth: spell.from,
          label: spell.home.name
        }))
      : undefined;

  // A typed line carries its own run rate off its rate and cadence. A linked one
  // does not, and this month × 12 is the mistake this page keeps catching: a
  // three-paycheck August annualises at 1.5×, and a quiet September of house
  // sitting at a third of the truth. So the fallback is the twelve-month average
  // × 12 wherever there is a timeline to average, and only a row with no history
  // at all — the client estimate, which is the same figure every month by
  // construction — falls back to the month itself.
  const yearAmount =
    subject.yearAmount ?? (summary.average !== null ? summary.average * 12 : subject.amount * 12);
  const detailRows = subject.detail?.rows ?? [];
  const sourceNote = subject.source ? SOURCE_NOTE[subject.source] : null;
  // Which level this is, said in a word, so a block can never be read as one of
  // the lines inside it. A line needs none: its own name and its source line
  // already say what it is.
  const eyebrow =
    subject.kind === "block" ? `In ${direction === "in" ? "Money in" : "Money out"}` : null;

  const cells = [
    {
      label: "12-mo avg",
      value: summary.average === null ? "—" : formatCurrency(summary.average)
    },
    {
      label: "Change",
      value: changeLabel(summary.change),
      // A rise in a commitment is bad news and a rise in income is good news, so
      // the tone follows the block the line sits in rather than the sign.
      tone:
        summary.change === null || Math.round(summary.change * 100) === 0
          ? undefined
          : ((summary.change > 0 === (direction === "in") ? "good" : "bad") as "good" | "bad")
    },
    // A run rate is an extrapolation rather than an amount anybody was charged,
    // so it is rounded — and dropped altogether on a line that has ended, which
    // is worth nothing a year from the day after.
    {
      label: "A year",
      value: yearAmount > 0 ? formatCurrencyRounded(yearAmount) : "—"
    }
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-[#1A1916]/30 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <aside
        className="sheet-panel flex h-full w-full flex-col overflow-hidden bg-page shadow-[0_24px_80px_rgba(48,38,24,0.22)] sm:h-auto sm:max-h-[88vh] sm:max-w-[600px] sm:rounded-[24px] sm:border sm:border-border"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={subject.label}
      >
        {/* The name, then the figure it is on the month for. The figure is the
            answer the reader arrived with; the month beside it is what stops it
            being read as "now" while browsing an old month. */}
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-5">
          <div className="min-w-0">
            {eyebrow ? (
              <div className="mb-1 truncate text-caption font-medium uppercase tracking-[0.05em] text-text-tertiary">
                {eyebrow}
              </div>
            ) : null}
            <h2 className="truncate text-figure-lg font-semibold leading-[1.15] tracking-[-0.01em] text-text-primary sm:text-display-sm">
              {subject.label}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-figure font-semibold tabular-nums text-text-primary">
                {formatCurrency(subject.amount)}
              </span>
              <span className="text-meta text-text-tertiary">in {periodMonthLabel(periodMonth)}</span>
            </div>
            {subject.hint || sourceNote ? (
              <p className="mt-1 text-meta text-text-secondary">
                {[subject.hint, sourceNote].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(16px+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          {/* One card, divided — never a stack of them. The stats, the chart,
              this month's working and the figures are four blocks of one thing. */}
          <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
            <Stats cells={cells} />

            <div className="border-t border-border">
              <RangePicker value={range} onChange={setRange} />

              {/* The answer the `By home` reading exists to give, above the
                  chart rather than under it: "is it more expensive here?" is
                  settled by two averages, and the line below is the context that
                  stops seasonality being mistaken for a move. */}
              {range === "homes" ? <HomeComparison spells={spells} direction={direction} /> : null}

              {visible.length >= 2 ? (
                <HistoryChart
                  points={visible}
                  marks={marks}
                  periodMonth={periodMonth}
                  direction={direction}
                />
              ) : (
                <p className="px-3.5 py-6 text-center text-list text-text-secondary sm:px-4">
                  {history.note ?? "Not enough months yet to draw a line."}
                </p>
              )}
            </div>

            {detailRows.length > 0 ? (
              <Block title="This month">
                <div className="divide-y divide-border/40">
                  {detailRows.map((line) => (
                    <div
                      key={line.label}
                      className="flex items-baseline justify-between gap-3 px-3.5 py-2 sm:px-4"
                    >
                      <span className="min-w-0 truncate text-list text-text-secondary">{line.label}</span>
                      <span className="shrink-0 text-list tabular-nums text-text-primary">{line.value}</span>
                    </div>
                  ))}
                </div>
              </Block>
            ) : null}
          </section>
        </div>
      </aside>
    </div>
  );
}

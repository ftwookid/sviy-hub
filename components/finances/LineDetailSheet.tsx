"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { CloseButton } from "@/components/ui/CloseButton";
import { HistoryChart, HistoryTable } from "@/components/finances/HistoryChart";
import { periodMonthLabel } from "@/lib/expenses";
import { formatCurrency, formatCurrencyRounded } from "@/lib/formatters";
import { historySummary, rowHistory, type HistorySources } from "@/lib/financeHistory";
import { useEscapeKey } from "@/lib/useEscapeKey";
import type { FinanceRow } from "@/types/finance";

/**
 * One line of the month, opened.
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
 * **Everything readable on the first screen.** No hover, no tooltip, no second
 * tap: the figure, the three stats and the whole chart are above the fold on a
 * 390×844 phone, and the month-by-month list underneath is the same numbers as
 * text. See `HistoryChart` for why the chart carries its scale in the gutter
 * rather than in a tooltip.
 */

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
function Stats({
  cells
}: {
  cells: { label: string; value: string; tone?: "good" | "bad" }[];
}) {
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
              cell.tone === "good" ? "text-success" : cell.tone === "bad" ? "text-danger" : "text-text-primary"
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

/** Where a linked figure is actually kept, so the reader knows where to go to fix it. */
const SOURCE_NOTE: Record<FinanceRow["source"], string | null> = {
  Manual: null,
  Utilities: "Billed in Utilities",
  Clients: "From the client list",
  "House Sitting": "From the calendar"
};

export function LineDetailSheet({
  row,
  direction,
  periodMonth,
  sources,
  onClose
}: {
  row: FinanceRow;
  /** Which way this line moves the month — it decides whether a rise is good news. */
  direction: "in" | "out";
  periodMonth: string;
  sources: HistorySources;
  onClose: () => void;
}) {
  useEscapeKey(onClose);

  const history = useMemo(() => rowHistory(row, sources, periodMonth), [row, sources, periodMonth]);
  const summary = useMemo(() => historySummary(history.points, periodMonth), [history.points, periodMonth]);

  // A typed line carries its own run rate off its rate and cadence. A linked one
  // does not, and this month × 12 is the mistake this page keeps catching: a
  // three-paycheck August annualises at 1.5×, and a quiet September of house
  // sitting at a third of the truth. So the fallback is the twelve-month average
  // × 12 wherever there is a timeline to average, and only a row with no history
  // at all — the client estimate, which is the same figure every month by
  // construction — falls back to the month itself.
  const yearAmount =
    row.yearAmount ?? (summary.average !== null ? summary.average * 12 : row.amount * 12);
  const detailRows = row.detail?.rows ?? [];
  const sourceNote = SOURCE_NOTE[row.source];

  const cells = [
    { label: "12-mo avg", value: summary.average === null ? "—" : formatCurrency(summary.average) },
    {
      label: "Change",
      value: changeLabel(summary.change),
      // A rise in a commitment is bad news and a rise in income is good news, so
      // the tone follows the block the line sits in rather than the sign.
      tone:
        summary.change === null || Math.round(summary.change * 100) === 0
          ? undefined
          : ((summary.change > 0) === (direction === "in") ? "good" : "bad") as "good" | "bad"
    },
    // A run rate is an extrapolation rather than an amount anybody was charged,
    // so it is rounded — and dropped altogether on a line that has ended, which
    // is worth nothing a year from the day after.
    { label: "A year", value: yearAmount > 0 ? formatCurrencyRounded(yearAmount) : "—" }
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
        aria-label={row.label}
      >
        {/* The name, then the figure it is on the month for. The figure is the
            answer the reader arrived with; the month beside it is what stops it
            being read as "now" while browsing an old month. */}
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-5">
          <div className="min-w-0">
            <h2 className="truncate text-figure-lg font-semibold leading-[1.15] tracking-[-0.01em] text-text-primary sm:text-display-sm">
              {row.label}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-figure font-semibold tabular-nums text-text-primary">
                {formatCurrency(row.amount)}
              </span>
              <span className="text-meta text-text-tertiary">in {periodMonthLabel(periodMonth)}</span>
            </div>
            {row.hint || sourceNote ? (
              <p className="mt-1 text-meta text-text-secondary">
                {[row.hint, sourceNote].filter(Boolean).join(" · ")}
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
              {history.points.length >= 2 ? (
                <HistoryChart points={history.points} />
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

            {history.points.length > 0 ? (
              <Block title="Month by month">
                <HistoryTable points={history.points} />
              </Block>
            ) : null}
          </section>
        </div>
      </aside>
    </div>
  );
}

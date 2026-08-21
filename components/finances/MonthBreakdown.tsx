"use client";

import { formatCurrency, formatCurrencyRounded } from "@/lib/formatters";
import { SECTION_STYLE, shareOfIncome } from "@/lib/finances";
import { BarRow, ChartCard, IN_INK, Meter, OUT_INK, type BarRowData } from "@/components/finances/chart";
import type { MonthFinances } from "@/types/finance";

/**
 * The month, in three charts, each answering exactly one question.
 *
 * This replaced a single nineteen-row table, and the reason it is three charts
 * rather than one is that the table was being asked three questions at once and
 * answered none of them well: how much of the month is spoken for, which blocks
 * take it, and which individual commitment is the one to go after. Every version
 * of the table lost whichever question it was not built around.
 *
 * - **How much is spoken for** is a single ratio against a limit, which is a
 *   meter — the only form that job wants.
 * - **Which blocks take it** is magnitude across six named things, which is a
 *   sorted bar chart. Sorted by size, not by the order the buckets were defined,
 *   because the question is which is biggest.
 * - **Which commitment to go after** is magnitude across every line in the month
 *   regardless of which block it sits in, so those bars share one scale and one
 *   list. Inside a block-by-block table this comparison was impossible: rent and
 *   a $15 subscription never appeared on the same axis.
 *
 * Money in is its own card. It is not a competitor to the outflows — it is the
 * denominator every share on the page is measured against, so it reads in green
 * and sits apart.
 */

function yearly(amount: number) {
  return `${formatCurrencyRounded(amount * 12)} a year`;
}

function percent(share: number) {
  return share >= 0.005 ? `${Math.round(share * 100)}%` : "under 1%";
}

/** How much of what came in is already promised, and to what. */
export function WhereItGoes({ month }: { month: MonthFinances }) {
  const blocks = month.sections
    .filter((section) => section.direction === "out")
    .sort((a, b) => b.total - a.total);
  const largest = Math.max(...blocks.map((block) => block.total), 0);

  const rows: BarRowData[] = blocks.map((block) => ({
    key: block.key,
    label: SECTION_STYLE[block.key].title,
    amount: block.total,
    share: block.total > 0 ? `${percent(shareOfIncome(block.total, month.moneyIn))} of money in` : undefined,
    note: yearly(block.total)
  }));

  return (
    <ChartCard title="Where it goes" note="By block">
      {month.moneyIn > 0 ? (
        <Meter
          filled={month.moneyOut}
          total={month.moneyIn}
          filledLabel={`${percent(shareOfIncome(month.moneyOut, month.moneyIn))} committed · ${formatCurrency(
            month.moneyOut
          )}`}
          restLabel={`${percent(shareOfIncome(month.leftOver, month.moneyIn))} left · ${formatCurrency(
            month.leftOver
          )}`}
        />
      ) : null}
      <div className="divide-y divide-border/50 border-t border-border">
        {rows.map((row) => (
          <BarRow key={row.key} row={row} max={largest} ink={OUT_INK} />
        ))}
      </div>
    </ChartCard>
  );
}

/**
 * Every commitment in the month on one scale, biggest first.
 *
 * The block a line belongs to is written under its name rather than encoded in
 * the bar's colour — seven hues on one axis is the thing the colour checks
 * refuse, and a name cannot be misread.
 */
export function Commitments({ month }: { month: MonthFinances }) {
  const lines = month.sections
    .filter((section) => section.direction === "out")
    .flatMap((section) =>
      section.rows.map((row) => ({
        key: `${section.key}-${row.key}`,
        label: row.label,
        amount: row.amount,
        block: SECTION_STYLE[section.key].title,
        hint: row.hint
      }))
    )
    .sort((a, b) => b.amount - a.amount);

  const largest = Math.max(...lines.map((line) => line.amount), 0);

  return (
    <ChartCard title="Every commitment, biggest first" note="Same scale">
      {lines.length === 0 ? (
        <p className="px-3.5 py-3 text-[12.5px] text-text-tertiary sm:px-4">
          Nothing committed this month. Standing figures are typed in Setup.
        </p>
      ) : (
        <div className="divide-y divide-border/50">
          {lines.map((line) => (
            <BarRow
              key={line.key}
              row={{
                key: line.key,
                label: line.label,
                amount: line.amount,
                note: [line.block, line.hint].filter(Boolean).join(" · "),
                secondary: yearly(line.amount)
              }}
              max={largest}
              ink={OUT_INK}
            />
          ))}
        </div>
      )}
    </ChartCard>
  );
}

/** The denominator: what actually arrived, and from where. */
export function MoneyIn({ month }: { month: MonthFinances }) {
  const rows = month.sections
    .filter((section) => section.direction === "in")
    .flatMap((section) => section.rows)
    .sort((a, b) => b.amount - a.amount);
  const largest = Math.max(...rows.map((row) => row.amount), 0);

  return (
    <ChartCard title="Money in" note={formatCurrency(month.moneyIn)}>
      <div className="divide-y divide-border/50">
        {rows.map((row) => (
          <BarRow
            key={row.key}
            row={{
              key: row.key,
              label: row.label,
              amount: row.amount,
              note: row.hint,
              share: `${percent(shareOfIncome(row.amount, month.moneyIn))} of money in`
            }}
            max={largest}
            ink={IN_INK}
          />
        ))}
      </div>
    </ChartCard>
  );
}

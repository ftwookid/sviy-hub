"use client";

import { Fragment } from "react";

import { formatCurrency, formatCurrencyRounded, formatShortDate } from "@/lib/formatters";
import { SECTION_STYLE, shareOfIncome } from "@/lib/finances";
import { BarRow, ChartCard, IN_INK, Meter, OUT_INK } from "@/components/finances/chart";
import type { FinanceRow, FinanceSection, MonthFinances } from "@/types/finance";

/**
 * The month, read by section.
 *
 * The version before this one dissolved the sections: it sorted the blocks by
 * size in one card and then poured **every line in the month** into another,
 * biggest first, with its block written underneath in 10px grey. That answered
 * "which single commitment is largest" and lost the question the page is
 * actually opened with — what does each part of the month cost — because a line
 * could no longer be found where it lives. Tax withheld was three rows apart
 * from tax withheld.
 *
 * So the buckets are back, **in their declared order** (tax, deductions, needs,
 * subscriptions, debt, savings), each a header row carrying its own total and
 * its share of what came in, with its lines beneath it. The order is fixed
 * rather than sorted by size so a block sits in the same place every month;
 * inside a block the lines are still biggest first, which is `sectionOf`'s job
 * in `lib/finances.ts`.
 *
 * The one thing worth keeping from the flat list was the shared scale, and it is
 * kept: **every bar in the card is measured against the largest line in the
 * month**, not against the biggest line in its own block. A $15 subscription
 * therefore draws a $15 bar next to rent instead of a full-width one, so the
 * cross-block comparison survives the sections. Per-block scaling is the trap
 * that was already tried and rejected — it made a $2.10 line look like the
 * biggest thing on the page.
 *
 * Headings say what they hold: `Money in`, `Money out`, and the bucket's own
 * name. No card here is titled with a phrase you have to interpret.
 */

function yearly(yearAmount: number) {
  return `${formatCurrencyRounded(yearAmount)} a year`;
}

function percent(share: number) {
  return share >= 0.005 ? `${Math.round(share * 100)}%` : "under 1%";
}

/**
 * A row's working: the payments the month's figure is a sum of, then what is
 * true of the line rather than of one payment.
 *
 * The dates are the point. A month holding a raise has two payments worth
 * different amounts, and no single sentence explains that as well as printing
 * both. A linked figure has no payments to list — it is an estimate off another
 * table — so there the hint that used to sit on the row is the whole detail.
 */
function detailFor(row: FinanceRow, extra?: string) {
  const lines = (row.payments ?? []).map((payment) => ({
    label: formatShortDate(payment.date),
    value: formatCurrency(payment.amount)
  }));
  const note = [lines.length === 0 ? row.hint : undefined, extra].filter(Boolean).join(" · ");
  return { lines, note: note || undefined };
}

/**
 * A bucket's own row: name, what it takes of the month's income, its total.
 *
 * The name outranks the lines under it — that is the whole job of a heading, and
 * a 10px uppercase whisper above near-black rows failed it on the Setup screen
 * for months. Three columns across the full width, because the row has three
 * facts and the space is there.
 */
function SectionHeader({ section, moneyIn }: { section: FinanceSection; moneyIn: number }) {
  const share = section.total > 0 && moneyIn > 0 ? `${percent(shareOfIncome(section.total, moneyIn))} of money in` : null;

  return (
    <div className="flex items-baseline gap-3 border-t border-border bg-subtle/50 px-3.5 py-1.5 sm:px-4">
      <h3 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-text-primary">
        {SECTION_STYLE[section.key].title}
      </h3>
      {share ? (
        <span className="shrink-0 text-[10.5px] tabular-nums text-text-tertiary">{share}</span>
      ) : null}
      <span className="shrink-0 text-[13px] font-medium tabular-nums text-text-primary">
        {formatCurrency(section.total)}
      </span>
    </div>
  );
}

/**
 * Everything the month is already promised to, by block.
 *
 * The meter sits at the top because it is the one figure the whole card is a
 * breakdown of: how much of what came in is spoken for. Both its ends are
 * labelled, so nothing has to be inferred from a length.
 */
export function MoneyOut({ month }: { month: MonthFinances }) {
  const sections = month.sections.filter((section) => section.direction === "out");
  // One scale for the card, taken across every line in every block, so a bar's
  // length means the same thing wherever it is read.
  const largest = Math.max(...sections.flatMap((section) => section.rows.map((row) => row.amount)), 0);

  return (
    <ChartCard title="Money out" note={formatCurrency(month.moneyOut)}>
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

      {sections.map((section) => (
        <Fragment key={section.key}>
          <SectionHeader section={section} moneyIn={month.moneyIn} />
          {/* An empty block is its header row and nothing else — there is no
              line to draw and no zero worth printing twice. */}
          <div className="divide-y divide-border/40">
            {section.rows.map((row) => (
              <BarRow
                key={row.key}
                row={{
                  key: row.key,
                  label: row.label,
                  amount: row.amount,
                  // Behind the row's own chevron, not printed on it. A run rate
                  // is still what turns a $15 line into a decision, and it still
                  // comes off the line's own rate rather than this month × 12
                  // (which would annualise a three-paycheck August at 1.5x) —
                  // it is just no longer competing with the figure the card is
                  // there to show, on every one of a dozen rows.
                  detail: detailFor(row, row.amount > 0 ? yearly(row.yearAmount ?? row.amount * 12) : undefined)
                }}
                max={largest}
                ink={OUT_INK}
              />
            ))}
          </div>
        </Fragment>
      ))}
    </ChartCard>
  );
}

/** The denominator: what actually arrived, and from where. */
export function MoneyIn({ month }: { month: MonthFinances }) {
  const sections = month.sections.filter((section) => section.direction === "in");
  const largest = Math.max(...sections.flatMap((section) => section.rows.map((row) => row.amount)), 0);
  // One in-block today, and its name and the card's title would say the same
  // thing twice. A second one would need telling apart, so the header appears
  // then and not before.
  const showHeaders = sections.length > 1;

  return (
    <ChartCard title="Money in" note={formatCurrency(month.moneyIn)}>
      {sections.map((section) => (
        <Fragment key={section.key}>
          {showHeaders ? <SectionHeader section={section} moneyIn={month.moneyIn} /> : null}
          <div className="divide-y divide-border/40">
            {section.rows.map((row) => (
              <BarRow
                key={row.key}
                row={{
                  key: row.key,
                  label: row.label,
                  amount: row.amount,
                  detail: detailFor(
                    row,
                    row.amount > 0 ? `${percent(shareOfIncome(row.amount, month.moneyIn))} of money in` : undefined
                  )
                }}
                max={largest}
                ink={IN_INK}
              />
            ))}
          </div>
        </Fragment>
      ))}
    </ChartCard>
  );
}

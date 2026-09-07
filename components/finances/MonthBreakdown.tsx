"use client";

import { Fragment } from "react";

import { cn } from "@/lib/cn";
import { formatCurrency, formatCurrencyRounded } from "@/lib/formatters";
import { SECTION_STYLE, shareOfIncome } from "@/lib/finances";
import { BarRow, ChartCard, ROW_END_SLOT } from "@/components/finances/chart";
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
 * **The rows carry no bars.** They did, on one scale across the whole card, and
 * the scale was the right answer to the wrong question: what this card is read
 * for is the figures, which are already printed exact to the cent, and against
 * rent the small lines the page exists to make killable drew stubs a few pixels
 * long that no one could tell apart. See `BarRow`.
 *
 * Headings say what they hold: `Money in`, `Money out`, and the bucket's own
 * name. No card here is titled with a phrase you have to interpret.
 */

/**
 * The run rate, or nothing.
 *
 * A line that has ended is worth 0 from the day after, so a month that still
 * shows it — the one it stopped in — would otherwise footnote it "$0 a year",
 * which is a zero pretending to be a figure rather than an answer.
 */
function yearly(row: FinanceRow) {
  const amount = row.yearAmount ?? row.amount * 12;
  return amount > 0 ? `${formatCurrencyRounded(amount)} a year` : undefined;
}

function percent(share: number) {
  return share >= 0.005 ? `${Math.round(share * 100)}%` : "under 1%";
}

/**
 * A row's working: the facts `lineDetail` found worth stating, then the run rate.
 *
 * The rows come from `lib/finances.ts`, which decides what is worth saying about
 * a line in a given month — see `lineDetail` for the test each one has to pass.
 * This adds only what is true of the row's place on the page rather than of the
 * line: the yearly run rate, and on `Money in` the share of the month it is.
 *
 * A linked figure has no schedule to describe — it is an estimate off another
 * table — so there the hint that used to sit on the row is the whole detail.
 */
function detailFor(row: FinanceRow, extra?: string) {
  const lines = row.detail?.rows ?? [];
  const note = [lines.length === 0 ? row.hint : undefined, extra].filter(Boolean).join(" · ");
  return { lines, note: note || undefined };
}

/**
 * A bucket's name, and only its name.
 *
 * It used to carry the block's total and its share of income as well, and that
 * is the arrangement this replaced: the heading announced the answer and the
 * lines underneath were its working, so reading the card meant taking a figure
 * from a title, dropping into a list, and climbing back out to a title for the
 * next one. Every figure a person wants to compare — the six block totals —
 * sat in a differently-styled row from every figure they are made of, and none
 * of them lined up.
 *
 * A total belongs at the foot of the column it totals, which is where every
 * ledger, receipt and bank statement puts it, and where the eye already looks
 * for it. So the heading opens the block and `SectionTotal` closes it.
 *
 * The name still outranks the lines under it — that is the whole job of a
 * heading, and a 10px uppercase whisper above near-black rows failed it on the
 * Setup screen for months.
 */
function SectionHeader({
  section,
  first
}: {
  section: FinanceSection;
  /**
   * The first block in a card sits directly under `ChartCard`'s own
   * `border-b`, so its `border-t` would stack into a 2px rule where every
   * other block boundary is 1px. The meter used to sit in that gap and hide
   * it; with the meter gone the block draws no top border of its own.
   */
  first: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-3 bg-subtle/50 px-3.5 py-1.5 sm:px-4",
        first ? null : "border-t border-border"
      )}
    >
      <h3 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-text-primary">
        {SECTION_STYLE[section.key].title}
      </h3>
    </div>
  );
}

/**
 * The sum at the foot of the block, under the figures it adds up.
 *
 * Three things make it read as a sum rather than as one more line:
 *
 * - **It is on the same right edge as the lines above it**, which is what the
 *   permanent `ROW_END_SLOT` is for. A total that does not line up with its
 *   own column is not a total, it is a number nearby.
 * - **A full-weight rule above it**, where the lines are separated by
 *   `border-border/40`. That is the ruled-off line of a paper ledger, and it
 *   is the cheapest possible way to say "everything above this adds to this".
 * - **It is not tinted.** The tint is the heading's, and it is what tells you a
 *   new block has started; a tinted footer against the next block's tinted
 *   header would put a two-row band between blocks and leave neither belonging
 *   to anything obvious.
 *
 * The share of income comes down here with it, because it is a fact about the
 * total rather than about the block: "22% of money in" is only meaningful
 * beside the figure it is 22% of.
 */
function SectionTotal({ section, moneyIn }: { section: FinanceSection; moneyIn: number }) {
  const share =
    section.total > 0 && moneyIn > 0 ? `${percent(shareOfIncome(section.total, moneyIn))} of money in` : null;

  return (
    <div className="flex items-center gap-2.5 border-t border-border px-3.5 py-2 sm:px-4">
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
        Total
      </span>
      {share ? (
        <span className="shrink-0 text-[10.5px] tabular-nums text-text-tertiary">{share}</span>
      ) : null}
      <span className="shrink-0 text-right text-[13px] font-semibold tabular-nums text-text-primary">
        {formatCurrency(section.total)}
      </span>
      <span aria-hidden className={ROW_END_SLOT} />
    </div>
  );
}

/**
 * Everything the month is already promised to, by block.
 *
 * **No meter at the top.** A single bar sat here splitting money in into
 * committed and left over, with both ends labelled — and labelling both ends is
 * not the same as being readable. It was one bar in a card full of bars, drawn
 * against a different denominator than every other bar under it, so its length
 * meant something the rest of the card's lengths did not; and both its figures
 * are already stated, as figures, in `MonthSummary` directly above the card.
 * A ratio nobody can name is noise however carefully it is labelled, so it is
 * gone rather than relabelled. Each block's share of income stays on the block's
 * own header row, where it is a number rather than a length.
 */
export function MoneyOut({ month }: { month: MonthFinances }) {
  const sections = month.sections.filter((section) => section.direction === "out");

  return (
    <ChartCard title="Money out" note={formatCurrency(month.moneyOut)}>
      {sections.map((section, index) => (
        <Fragment key={section.key}>
          <SectionHeader section={section} first={index === 0} />
          {/* An empty block is its header row and nothing else — no line to
              draw, and no total either: a block with nothing in it has nothing
              to add up, and `Total $0.00` is the zero pretending to be a figure
              this page keeps catching. The name standing alone says it. */}
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
                  detail: detailFor(row, yearly(row))
                }}
              />
            ))}
          </div>
          {section.rows.length > 0 ? <SectionTotal section={section} moneyIn={month.moneyIn} /> : null}
        </Fragment>
      ))}
    </ChartCard>
  );
}

/** The denominator: what actually arrived, and from where. */
export function MoneyIn({ month }: { month: MonthFinances }) {
  const sections = month.sections.filter((section) => section.direction === "in");
  // One in-block today, and its name and the card's title would say the same
  // thing twice. A second one would need telling apart, so the header appears
  // then and not before.
  const showHeaders = sections.length > 1;

  return (
    <ChartCard title="Money in" note={formatCurrency(month.moneyIn)}>
      {sections.map((section, index) => (
        <Fragment key={section.key}>
          {showHeaders ? <SectionHeader section={section} first={index === 0} /> : null}
          <div className="divide-y divide-border/40">
            {section.rows.map((row) => (
              <BarRow
                key={row.key}
                row={{
                  key: row.key,
                  label: row.label,
                  amount: row.amount,
                  // What it earns in a year is worth the same as what a
                  // commitment costs in one; the share is what is particular to
                  // this card.
                  detail: detailFor(
                    row,
                    [
                      yearly(row),
                      row.amount > 0 ? `${percent(shareOfIncome(row.amount, month.moneyIn))} of money in` : undefined
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  )
                }}
              />
            ))}
          </div>
          {showHeaders && section.rows.length > 0 ? (
            <SectionTotal section={section} moneyIn={month.moneyIn} />
          ) : null}
        </Fragment>
      ))}
    </ChartCard>
  );
}

"use client";

import { Fragment } from "react";

import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
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

function percent(share: number) {
  return share >= 0.005 ? `${Math.round(share * 100)}%` : "under 1%";
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
 * Setup screen for months. It is the **middle of the card's type ramp**: 17px
 * for the card, **15px here**, 13px for a line, with weight and colour stepping
 * alongside. It was 13.5px against 13px lines and a 13px card title, which is
 * three levels of structure inside half a pixel — see `ChartCard`.
 *
 * The tint is full `bg-subtle` rather than the half-strength it was, and the row
 * is 10px of padding rather than 6px, because this is the band that says a new
 * block has started and it was reading as a slightly bolder line.
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
        "flex items-baseline gap-3 bg-subtle px-3.5 py-2.5 sm:px-4",
        first ? null : "border-t border-border"
      )}
    >
      <h3 className="min-w-0 flex-1 truncate text-label font-semibold tracking-[-0.01em] text-text-primary">
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
 * - **Air, and a heavier figure.** A rule on its own was not enough — with the
 *   same padding and the same 13px figure as the rows above, the sum read as
 *   one more line item. It has more room beneath it than above, so the space
 *   belongs to the block it closes rather than to the heading that follows, and
 *   its figure is 14.5px semibold against the lines' 13px.
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
    <div className="flex items-center gap-2.5 border-t border-border px-3.5 pb-3 pt-2.5 sm:px-4">
      <span className="min-w-0 flex-1 truncate text-caption font-semibold uppercase tracking-[0.05em] text-text-secondary">
        Total
      </span>
      {share ? (
        <span className="shrink-0 text-micro tabular-nums text-text-tertiary">{share}</span>
      ) : null}
      <span className="shrink-0 text-right text-body font-semibold tabular-nums text-text-primary">
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
export function MoneyOut({ month, onOpenRow }: { month: MonthFinances; onOpenRow: (row: FinanceRow) => void }) {
  const sections = month.sections.filter((section) => section.direction === "out");

  return (
    <ChartCard title="Money out" note={formatCurrency(month.moneyOut)}>
      {sections.map((section, index) => (
        <Fragment key={section.key}>
          <SectionHeader section={section} first={index === 0} />
          {/* An empty block has no total — nothing in it to add up, and
              `Total $0.00` is the zero pretending to be a figure this page keeps
              catching. It does get a row, though: a bare heading sat straight
              against the next block's heading, and two tinted bands with one
              hairline between them read as a single double-height band rather
              than as an empty block followed by a full one. A dash is what this
              app says when there is no figure, and the white row it sits on is
              what keeps the two bands apart. */}
          <div className="divide-y divide-border/40">
            {section.rows.length === 0 ? (
              <div className="px-3.5 py-2 text-list text-text-tertiary sm:px-4">—</div>
            ) : null}
            {section.rows.map((row) => (
              // Behind the row's own chevron, not printed on it: the run rate,
              // what one payment is worth, how many landed — and the timeline
              // none of that could ever fit. See `LineDetailSheet`.
              <BarRow
                key={row.key}
                row={{ key: row.key, label: row.label, amount: row.amount }}
                onOpen={() => onOpenRow(row)}
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
export function MoneyIn({ month, onOpenRow }: { month: MonthFinances; onOpenRow: (row: FinanceRow) => void }) {
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
                row={{ key: row.key, label: row.label, amount: row.amount }}
                onOpen={() => onOpenRow(row)}
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

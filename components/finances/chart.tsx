"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";

/**
 * The chart pieces the Finances month is drawn with.
 *
 * Everything here follows one decision: **magnitude is encoded by length from a
 * shared baseline, never by colour.** The block palette this app already uses —
 * sand, stone, gold, slate, terracotta, sage — was measured against the
 * colour-vision checks and fails them as a categorical encoding: the worst
 * adjacent pair separates by ΔE 5.9 under deuteranopia and only 9.3 under normal
 * vision, where 15 is the floor for "tellable apart at a glance". Those hues stay
 * exactly as they are for identity — a dot beside a name, a strip in Setup — but
 * they cannot be asked to carry a quantity, and neither can a ring of seven
 * slices. Length can, for everybody.
 *
 * So each chart here is one series in one hue, which needs no legend because the
 * card's title already names it, with the value printed in a column beside the
 * bar. That combination is also its own table view: every quantity is readable as
 * text, so nothing is gated behind seeing colour or hovering.
 *
 * Marks follow the house spec: 10px bars, capped well under 24px; a 4px rounded
 * data-end with a square baseline; a hairline track one step off the surface; no
 * gridlines, because every value is labelled; no dashes and no borders drawn
 * around marks.
 */

/**
 * Chart ink, measured at ≥ 3:1 against the surface.
 *
 * One hue is all that is left: the month's rows carry no bars any more, so this
 * serves the utility grid, where a bar against twelve cells of one account is a
 * shape worth seeing. `IN_INK` went with the money-in bars that used it.
 */
export const OUT_INK = "#A8823C";
const TRACK = "#EDEAE3";

/**
 * The width the row's chevron takes out of the line, and the space anything
 * without one has to leave in its place.
 *
 * The slot is **permanent** — that is its whole point. Before it existed, a row
 * with nothing on its end simply dropped the element, which pushed that row's
 * figure 44px further right than its neighbours: two right edges in the one card
 * that exists to be read straight down. It is matched by the section total
 * beneath, so the sum lands under the numbers it adds up.
 */
export const ROW_END_SLOT = "w-[34px] shrink-0";

/** A bar, grown from the left baseline. Never wider than its track. */
export function Bar({ share, ink }: { share: number; ink: string }) {
  return (
    <span className="block h-2.5 w-full overflow-hidden rounded-[3px]" style={{ background: TRACK }}>
      <span
        className="block h-full rounded-r-[4px]"
        style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, background: ink }}
      />
    </span>
  );
}

export type BarRowData = {
  key: string;
  label: string;
  amount: number;
};

/**
 * One row: name, figure, and a chevron saying it opens.
 *
 * **No bar under the name.** Every line in the month used to carry one, scaled
 * against the largest line in the card, and it earned none of the height it
 * cost. What a reader does here is read down a column of figures — is this
 * month's rent what it was, what is the tax, what is the subscription pile —
 * and the figures are right there, in a column, exact to the cent. A length
 * beside an exact number answers a question nobody was asking, and it answered
 * it badly: against a $2,395 rent, the small lines this page exists to make
 * killable — a $15 subscription, a $2.99 iCloud — drew a stub two or three
 * pixels long, indistinguishable from each other and from nothing.
 *
 * It also read as a progress bar, which is what Ivan called it: a filled track
 * looks like something advancing toward a target, and none of these lines are
 * going anywhere. The comparison the bars were for survives where it belongs:
 * the share of income on each block's header row, and `YearList` for month
 * against month.
 *
 * **The whole row is the control, and the ⓘ that used to sit on it is gone.**
 * The row carried a 42px info target opening a small anchored panel of facts
 * about *this month* — what one payment is worth, how many landed, the run rate.
 * Those facts are worth having and they are all still there, inside
 * `LineDetailSheet`, along with the thing they could never fit: the line's own
 * timeline. Two affordances on one row, a small one for a few facts and the row
 * itself for the same facts plus a chart, is a choice nobody should have to
 * make — so there is one, and it is the row.
 *
 * The chevron is not decoration. A row nobody can see is interactive is a row
 * nobody taps, and it costs nothing: it sits in the permanent `ROW_END_SLOT`
 * that already held the ⓘ, so the column of figures keeps its single right edge
 * and the section total beneath still lands under the numbers it adds up.
 *
 * `min-h-11` is the floor now the row is the target rather than an icon on it.
 * It takes a 42.5px row to 44px — about 18px across a twelve-line `Money out`,
 * which is what a thumb costs.
 */
export function BarRow({ row, onOpen }: { row: BarRowData; onOpen?: () => void }) {
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate text-list text-text-secondary">{row.label}</span>
      <span className="shrink-0 text-right text-list tabular-nums text-text-primary">
        {formatCurrency(row.amount)}
      </span>
    </>
  );

  const title = `${row.label} — ${formatCurrency(row.amount)}`;
  const padding = "px-3.5 py-2 sm:px-4";

  if (!onOpen) {
    return (
      <div className={cn("flex min-h-11 items-center gap-2.5", padding)} title={title}>
        {body}
        <span aria-hidden className={ROW_END_SLOT} />
      </div>
    );
  }

  return (
    <button
      type="button"
      title={title}
      aria-label={`${row.label} — ${formatCurrency(row.amount)}. Open its history.`}
      onClick={onOpen}
      className={cn(
        "focus-ring group flex min-h-11 w-full items-center gap-2.5 text-left transition-colors duration-200 ease-out hover:bg-subtle/60",
        padding
      )}
    >
      {body}
      <span className={cn("flex justify-end", ROW_END_SLOT)}>
        <ChevronRight
          size={16}
          strokeWidth={1.8}
          className="text-text-tertiary transition-colors duration-200 ease-out group-hover:text-text-secondary"
        />
      </span>
    </button>
  );
}

/**
 * The card, and the top of the type ramp.
 *
 * The ramp is the whole point of these sizes, so it is written down: **17px for
 * the card, 15px for a block inside it, 13px for a line inside that.** It used
 * to be 13 / 13.5 / 13 — the card's own title was *smaller* than the blocks it
 * contained, and a line sat half a pixel under the heading that governed it.
 * Three levels of structure within 0.5px of each other is not a hierarchy, it is
 * three rows of similar text, and the reader has to parse the card to find out
 * what contains what instead of seeing it.
 *
 * Size is not carrying it alone — weight and colour step with it (semibold
 * primary for the two headings, regular secondary for a line), because a
 * two-pixel difference is easy to miss on a phone and three cues agreeing are
 * not.
 *
 * The card's own total moved with the title, and sits at the *same* 17px: it was
 * a 10px uppercase whisper in tertiary grey, smaller than every figure it is the
 * sum of. The figures ramp too — **17px for the card's total, 14.5px for a
 * block's, 13px for a line** — and 15px was tried first, which put the grand
 * total half a pixel from a section total and repeated the near-miss the ramp
 * exists to fix.
 */
export function ChartCard({
  title,
  note,
  children
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-3.5 py-3 sm:px-4">
        <h2 className="min-w-0 truncate text-subhead font-semibold tracking-[-0.01em] text-text-primary">
          {title}
        </h2>
        {note ? (
          <span className="shrink-0 text-subhead font-semibold tabular-nums text-text-primary">{note}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

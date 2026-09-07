"use client";

import { useRef, useState } from "react";
import { Info } from "lucide-react";
import { AnchoredPanel } from "@/components/ui/AnchoredPanel";
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
  /**
   * The row's working, behind a `ⓘ` on the row.
   *
   * These facts — what one payment is worth, how many landed, the yearly run
   * rate, the share of income — used to print on every line, so "Federal Income
   * Tax (Ivan)" came with "2 payments · $316.84 every 2 weeks" under it and
   * "$8,238 a year" beside it, on each of a dozen rows: three facts competing
   * with the one the card exists to show.
   *
   * What goes in here is decided by `lineDetail` in `lib/finances.ts`, against
   * one test — does this say something the row cannot. The first version failed
   * it by listing every payment by date, which on a line whose payments are all
   * equal is one figure printed twice.
   *
   * Two attempts before this one. Joining them into a grey sentence read as an
   * annotation *on* the row rather than an answer to it. Expanding the row in
   * place answered properly but **moved the page**: this is a list read by
   * scanning down a column of figures, and pushing everything below the row
   * down by four lines costs the reader their place — for a glance that is over
   * in a second.
   *
   * So it opens **over** the list, pinned to the icon, in the same
   * `AnchoredPanel` the pickers use. Nothing reflows, nothing scrolls, and
   * dismissing it puts the reader back exactly where they were.
   */
  detail?: { lines?: { label: string; value: string }[]; note?: string };
};

/**
 * One row: name, figure.
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
 * going anywhere. Removing it takes the row from 51px to 42.5px — the `ⓘ`'s
 * 42px tap target is the floor now, not the bar — which is about 100px off a
 * twelve-line Money out, and turns the card from a chart back into what it
 * always was, a list of figures.
 *
 * The comparison the bars were for survives where it belongs: the share of
 * income on each block's header row, and `YearList` for month against month.
 */
export function BarRow({ row, action }: { row: BarRowData; action?: () => void }) {
  const [open, setOpen] = useState(false);
  const infoRef = useRef<HTMLButtonElement>(null);
  const detail = row.amount > 0 ? row.detail : undefined;
  const detailLines = detail?.lines ?? [];
  const hasDetail = Boolean(detail && (detailLines.length > 0 || detail.note));

  const body = (
    <>
      <span className="min-w-0 flex-1 truncate text-[13px] text-text-secondary">{row.label}</span>
      <span className="shrink-0 text-right text-[13px] tabular-nums text-text-primary">
        {formatCurrency(row.amount)}
      </span>
    </>
  );

  const title = `${row.label} — ${formatCurrency(row.amount)}`;
  const padding = "px-3.5 py-2 sm:px-4";
  // One line, so `items-center` simply centres the three things on it. It
  // mattered more when the name sat above a bar: aligning to the top of that
  // stacked column put the figure level with the name and left it sitting high
  // over the bar.

  if (hasDetail) {
    return (
      /* The row itself stays a reading, not a control. Only the ⓘ is
         interactive, and it grows its tap target with padding pulled back by an
         equal negative margin, so the target is 40px and the row keeps the
         height it had. */
      <div className={cn("flex items-center gap-2.5", padding)} title={title}>
        {body}
        {/* The target is 42px and invisible; the circle inside it is what is
            seen. Painting the hover, press and focus on the button itself lit a
            42px square around a 14px icon — the right hit area wearing the wrong
            geometry. */}
        <button
          ref={infoRef}
          type="button"
          aria-label={`What ${row.label} is made of`}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="focus-ring-child group -my-2 -mr-2 shrink-0 px-2 py-2"
        >
          <span
            className={cn(
              "grid h-[26px] w-[26px] place-items-center rounded-full transition-colors duration-200 ease-out",
              open ? "bg-subtle text-text-secondary" : "text-text-tertiary group-hover:bg-subtle"
            )}
          >
            <Info size={14} strokeWidth={1.8} />
          </span>
        </button>

        <AnchoredPanel
          anchorRef={infoRef}
          open={open}
          onClose={() => setOpen(false)}
          width={240}
          className="p-3"
        >
          <p className="mb-1.5 truncate text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
            {row.label}
          </p>
          {detailLines.map((line) => (
            <div key={line.label} className="flex items-baseline justify-between gap-3 py-0.5">
              <span className="min-w-0 truncate text-[12.5px] text-text-secondary">{line.label}</span>
              <span className="shrink-0 text-[12.5px] tabular-nums text-text-primary">{line.value}</span>
            </div>
          ))}
          {/* Under the rows the note is a footnote — the run rate, the share —
              and it is set like one. With no rows above it the note *is* the
              answer, and a single line of 11.5px grey under a heading reads as
              a panel that failed to load. */}
          {detail?.note ? (
            <p
              className={cn(
                detailLines.length > 0
                  ? "mt-1.5 border-t border-border/60 pt-1.5 text-[11.5px] text-text-tertiary"
                  : "text-[12.5px] text-text-secondary"
              )}
            >
              {detail.note}
            </p>
          ) : null}
        </AnchoredPanel>
      </div>
    );
  }

  if (!action) {
    return (
      <div className={cn("flex items-center gap-2.5", padding)} title={title}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      title={title}
      onClick={action}
      className={cn(
        "focus-ring flex w-full items-center gap-2.5 text-left transition-colors duration-200 ease-out hover:bg-subtle/60",
        padding
      )}
    >
      {body}
    </button>
  );
}

/** A card title. Names the single series, which is why no legend is needed. */
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
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-3.5 py-2 sm:px-4">
        <h2 className="min-w-0 truncate text-[13px] font-medium text-text-primary">{title}</h2>
        {note ? (
          <span className={cn("shrink-0 text-[10px] font-medium uppercase tracking-[0.06em] text-text-tertiary")}>
            {note}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

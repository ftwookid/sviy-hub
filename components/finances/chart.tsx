"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
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

/** Chart ink. One hue per series, both measured at ≥ 3:1 against the surface. */
export const OUT_INK = "#A8823C";
export const IN_INK = "#4A8C6F";
const TRACK = "#EDEAE3";

/** A bar, grown from the left baseline. Never wider than its track. */
function Bar({ share, ink }: { share: number; ink: string }) {
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
   * The row's working, opened by tapping it.
   *
   * These three facts — the payment count and cadence, the yearly run rate, the
   * share of income — used to print on every line, so "Federal Income Tax
   * (Ivan)" came with "2 payments · $316.84 every 2 weeks" under it and "$8,238
   * a year" beside it, on each of a dozen rows: three facts competing with the
   * one the card exists to show.
   *
   * Hiding them behind a tap was right; the first attempt at *showing* them was
   * not. It joined them into one grey sentence, which reads as a tooltip — an
   * annotation on the row — when what a tap on a figure promises is a
   * **breakdown**. So `lines` is a real two-column list: the dates the month's
   * figure is a sum of, and what each one was worth. In a month holding a raise
   * that is the whole answer, because the two payments differ. `note` carries
   * what is true of the line rather than of one payment — the run rate.
   */
  detail?: { lines?: { label: string; value: string }[]; note?: string };
};

/**
 * One row: name, bar, figure.
 *
 * The figure sits in a fixed right-hand column rather than at the bar's tip.
 * Tip labels put every number at a different horizontal position, which is fine
 * for reading one bar and useless for reading down thirty — and reading down is
 * the whole job here. Bars keep a common baseline on the left, so their *ends*
 * still carry the comparison.
 */
export function BarRow({
  row,
  max,
  ink,
  action
}: {
  row: BarRowData;
  max: number;
  ink: string;
  action?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const detail = row.amount > 0 ? row.detail : undefined;
  const detailLines = detail?.lines ?? [];
  const expandable = !action && Boolean(detail && (detailLines.length > 0 || detail.note));

  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-text-secondary">{row.label}</span>
        {/* No mark for a zero. An empty track is a bar drawn for a quantity that
            does not exist, and four of them down a card is three lines each of
            ink saying nothing. The row stays, because it is where a line gets
            added. */}
        {row.amount > 0 ? (
          <span className="mt-1 block">
            <Bar share={max > 0 ? row.amount / max : 0} ink={ink} />
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-right text-[13px] tabular-nums text-text-primary">
        {formatCurrency(row.amount)}
      </span>
      {/* A small, real affordance rather than a row that is secretly tappable.
          12px in the column the amount already occupies — the label keeps its
          width. */}
      {expandable ? (
        <ChevronDown
          size={13}
          strokeWidth={2}
          className={cn(
            "mt-0.5 shrink-0 text-text-tertiary transition-transform duration-200 ease-out",
            open && "rotate-180"
          )}
        />
      ) : null}
    </>
  );

  const title = `${row.label} — ${formatCurrency(row.amount)}`;
  const padding = "px-3.5 py-2 sm:px-4";

  if (expandable) {
    return (
      <div>
        <button
          type="button"
          title={title}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            "focus-ring flex w-full items-start gap-2.5 text-left transition-colors duration-200 ease-out hover:bg-subtle/60",
            padding
          )}
        >
          {body}
        </button>
        {open ? (
          /* Indented under the row it explains, and ruled off from it, so it
             reads as this line's working rather than as another line. */
          <div className="border-l-2 border-border pb-2.5 pl-3 ml-3.5 mr-3.5 sm:ml-4 sm:mr-4">
            {detailLines.map((line) => (
              <div key={line.label} className="flex items-baseline justify-between gap-3 py-0.5">
                <span className="min-w-0 truncate text-[12px] text-text-secondary">{line.label}</span>
                <span className="shrink-0 text-[12px] tabular-nums text-text-primary">{line.value}</span>
              </div>
            ))}
            {detail?.note ? (
              <p
                className={cn(
                  "text-[11px] text-text-tertiary",
                  detailLines.length > 0 && "mt-1 border-t border-border/60 pt-1"
                )}
              >
                {detail.note}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (!action) {
    return (
      <div className={cn("flex items-start gap-2.5", padding)} title={title}>
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
        "focus-ring flex w-full items-start gap-2.5 text-left transition-colors duration-200 ease-out hover:bg-subtle/60",
        padding
      )}
    >
      {body}
    </button>
  );
}

/**
 * A single ratio against a limit — the one job a meter is the right form for.
 *
 * Both ends are labelled directly, so the reader is never asked what the filled
 * part is a part of.
 */
export function Meter({
  filled,
  total,
  filledLabel,
  restLabel
}: {
  filled: number;
  total: number;
  filledLabel: string;
  restLabel: string;
}) {
  const share = total > 0 ? Math.max(0, Math.min(1, filled / total)) : 0;

  return (
    <div className="px-3.5 py-2.5 sm:px-4">
      <span className="block h-2.5 w-full overflow-hidden rounded-[3px]" style={{ background: TRACK }}>
        <span
          className="block h-full rounded-r-[4px]"
          style={{ width: `${share * 100}%`, background: OUT_INK }}
        />
      </span>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[11.5px] tabular-nums text-text-secondary">{filledLabel}</span>
        <span className="min-w-0 truncate text-[11.5px] tabular-nums text-success">{restLabel}</span>
      </div>
    </div>
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

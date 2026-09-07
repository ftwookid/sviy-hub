"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { AnchoredPanel } from "@/components/ui/AnchoredPanel";
import { Bar, OUT_INK } from "@/components/finances/chart";
import { SECTION_STYLE } from "@/lib/finances";
import { MONTHS } from "@/lib/months";
import { periodMonthLabel, periodMonthShortLabel } from "@/lib/expenses";
import { formatCurrency } from "@/lib/formatters";
import { billFor, firstBillYear, monthValue, monthsOfYear, periodMonthOf, utilityTrend } from "@/lib/utilities";
import { DEFAULT_UTILITY_BUCKET, UTILITY_BUCKETS } from "@/types/utility";
import type { UtilityAccountBills, UtilityBill, UtilityBook, UtilityBucket } from "@/types/utility";

/**
 * Every metered bill, and the months behind it — in one card.
 *
 * The shape is the Setup panel's, because the job is the same one: a list read
 * to find a name, and one row at a time opening into what it is made of. What is
 * different is what opens. A standing figure expands to a list of dated changes,
 * because a change is a rare event. A utility expands to **the chart**, because
 * with a utility every month is a change, and the only question worth opening
 * the row for is whether the line is drifting upward.
 *
 * So there is no separate entry form: the month you tap **is** where that month's
 * bill is typed. That is the same rule the Setup panel arrived at the hard way —
 * one form, in the place the figure is read, so there are never two identical
 * forms on a card to type a figure into the wrong one of.
 *
 * What opens is **a year at a time, as a grid**. It was a rolling twelve months
 * anchored on the page's month, laid out as twelve 44px rows, and that was wrong
 * in two ways at once on an account with any history. It was 701px on a phone —
 * most of the fold spent on one utility. And the rolling window could only ever
 * reach the last twelve months, so an electricity account billed since 2023 had
 * three of its four years with no way in at all: the only route to March 2024 was
 * to leave the panel, move the whole Finances page back to that month, and come
 * back in.
 *
 * A calendar year is what a reader actually navigates by — nobody hunts for "the
 * bill eleven months back", they think "March, the year the boiler went" — and a
 * 3-up grid puts all twelve of them in 242px instead of 528. The year steps with
 * two arrows, so the reachable history is every year there is a bill for, at a
 * fixed cost in height however many years that becomes.
 */

function parseAmount(value: string) {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/** "+12%" / "−4%" — the direction is the sign, and nothing here says what to do about it. */
function changeLabel(change: number | null) {
  if (change === null) return "—";
  const percent = Math.round(change * 100);
  if (percent === 0) return "No change";
  return `${percent > 0 ? "+" : "−"}${Math.abs(percent)}%`;
}

/**
 * Which section of the month this bill lands in.
 *
 * Needs by default, because that is what a utility is — but it shows the whole
 * list with a tick rather than cycling, like every other control in the app that
 * changes what a number means. It sits as a caption at the top of the expanded
 * row, where a line about the figure belongs, so it costs no row of its own.
 */
function BucketPicker({ value, onChange }: { value: UtilityBucket; onChange: (next: UtilityBucket) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        // The target is grown with padding and pulled back with an equal negative
        // margin, so the caption keeps its line and the thumb still gets 40px.
        // Only the words are painted.
        className="focus-ring-child group -my-2.5 -ml-1.5 flex items-center px-1.5 py-3"
        type="button"
        aria-label={`Counted in ${value} — change which section`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex min-w-0 items-center gap-0.5 rounded-md px-1 py-0.5 text-caption text-text-tertiary transition-colors duration-200 ease-out group-hover:bg-surface group-hover:text-text-secondary">
          <span className="truncate">Counted in {SECTION_STYLE[value].title}</span>
          <ChevronDown size={12} strokeWidth={2} className="shrink-0" />
        </span>
      </button>

      <AnchoredPanel anchorRef={triggerRef} open={open} onClose={() => setOpen(false)} width={224} className="p-1.5">
        {UTILITY_BUCKETS.map((bucket) => (
          <button
            key={bucket}
            className={cn(
              "focus-ring flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-body transition-colors duration-200 ease-out",
              bucket === value ? "bg-accent-soft text-text-primary" : "text-text-secondary hover:bg-subtle"
            )}
            type="button"
            onClick={() => {
              onChange(bucket);
              setOpen(false);
            }}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className={cn("h-3.5 w-1.5 shrink-0 rounded-full", SECTION_STYLE[bucket].color)} />
              <span className="truncate">{SECTION_STYLE[bucket].title}</span>
            </span>
            {bucket === value ? <Check size={15} strokeWidth={2} className="shrink-0" /> : null}
          </button>
        ))}
      </AnchoredPanel>
    </>
  );
}

/**
 * Three figures, one set of chrome — the house pattern, without a card of its own.
 *
 * It follows the year being browsed rather than a rolling twelve anchored on the
 * page, so the comparison names the two years it is comparing instead of leaving
 * the reader to work out which twelve months "12-mo avg" meant.
 */
function TrendStrip({ bills, year }: { bills: UtilityAccountBills["bills"]; year: number }) {
  const { recentAverage, priorAverage, change } = utilityTrend(bills, periodMonthOf(year, 11));

  const cells: { label: string; value: string }[] = [
    { label: `${year} avg`, value: recentAverage === null ? "—" : formatCurrency(recentAverage) },
    { label: `${year - 1} avg`, value: priorAverage === null ? "—" : formatCurrency(priorAverage) },
    { label: "Change", value: changeLabel(change) }
  ];

  return (
    <div className="mb-2.5 grid grid-cols-3 divide-x divide-border/60 rounded-xl border border-border/60 bg-surface">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 px-2.5 py-2">
          <div className="truncate text-micro font-medium uppercase tracking-[0.05em] text-text-tertiary">
            {cell.label}
          </div>
          <div className="mt-0.5 truncate text-label font-medium tabular-nums leading-none text-text-primary">
            {cell.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Which year the grid is showing.
 *
 * The arrows are for the step you make most — last year, next year — and the
 * label opens the rest, because a reader who keeps paper from 2023 should not
 * tap three times to get there, and because a control that changes what you are
 * looking at shows you the options rather than making you cycle to find them.
 * Same shape as the app's own `MonthPicker`: arrows either side, label opens
 * the list.
 *
 * The count beside each year answers "is there anything in 2024?" without
 * stepping into it to find out — the same job the client filter's counts do.
 */
function YearPicker({
  year,
  minYear,
  maxYear,
  billsPerYear,
  onChange
}: {
  year: number;
  minYear: number;
  maxYear: number;
  billsPerYear: Map<number, number>;
  onChange: (next: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Newest first: the year being logged into is almost always the recent one,
  // and the history is what you scroll for.
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index);

  return (
    <>
      {/* A chip that is painted at rest, not a bare number that lights up on
          hover. It was the inflated-target pattern — a 72x52 hit area painting
          only its 64x28 label — which is right for a caption sitting on a label
          line and wrong here: on the screen this is used on there is no hover, so
          nothing said it was a control at all, and the part you aim at read as
          about half the size of the thing you were aiming for. The house chip
          (`ClientFilterMenu`) is the shape for a control that opens a list: the
          target and the paint are the same 44px box, bordered like the month
          cells directly under it so it stands off the tinted panel. */}
      <button
        ref={triggerRef}
        className="focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 text-label font-medium tabular-nums text-text-primary transition-colors duration-200 ease-out hover:bg-subtle"
        type="button"
        aria-label={`${year} — choose another year`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{year}</span>
        <ChevronDown size={15} strokeWidth={2} className="shrink-0 text-text-tertiary" />
      </button>

      <AnchoredPanel
        anchorRef={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        width={208}
        className="max-h-[264px] overflow-y-auto p-1.5"
      >
        {years.map((option) => {
          const count = billsPerYear.get(option) ?? 0;
          return (
            <button
              key={option}
              className={cn(
                "focus-ring flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-body transition-colors duration-200 ease-out",
                option === year ? "bg-accent-soft text-text-primary" : "text-text-secondary hover:bg-subtle"
              )}
              type="button"
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              <span className="tabular-nums">{option}</span>
              <span className="flex items-center gap-2">
                {/* A year with nothing in it says so quietly rather than with a
                    zero pretending to be a figure. */}
                <span className="text-meta tabular-nums text-text-tertiary">
                  {count === 0 ? "—" : `${count} ${count === 1 ? "bill" : "bills"}`}
                </span>
                {option === year ? <Check size={15} strokeWidth={2} className="shrink-0" /> : null}
              </span>
            </button>
          );
        })}
      </AnchoredPanel>
    </>
  );
}

/**
 * One month of the year: what it cost, and the way in to typing it.
 *
 * The bar is scaled against **every** bill on the account, not just this year's,
 * so stepping from 2023 to 2026 makes a rise visible as length rather than
 * redrawing the same bars at a new scale each year — which is the one thing that
 * would make this chart lie. A month with no bill draws no mark at all; it keeps
 * the space so the grid stays square, but an empty track is a bar drawn for a
 * quantity that does not exist.
 */
function MonthCell({
  periodMonth,
  monthIndex,
  bill,
  largest,
  selected,
  onSelect
}: {
  periodMonth: string;
  monthIndex: number;
  bill: UtilityBill | null;
  largest: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={cn(
        "focus-ring rounded-xl border px-2 py-1.5 text-left transition-colors duration-200 ease-out",
        selected
          ? "border-accent bg-accent-soft"
          : "border-border/60 bg-surface hover:border-border hover:bg-subtle/60"
      )}
      type="button"
      aria-pressed={selected}
      aria-label={
        bill
          ? `Edit the ${periodMonthLabel(periodMonth)} bill of ${formatCurrency(bill.amount)}`
          : `Enter the ${periodMonthLabel(periodMonth)} bill`
      }
      onClick={onSelect}
    >
      <span className="block text-caption font-medium uppercase tracking-[0.05em] text-text-tertiary">
        {MONTHS[monthIndex].slice(0, 3)}
      </span>
      <span
        className={cn(
          "mt-0.5 block truncate text-list tabular-nums leading-tight",
          bill ? "text-text-primary" : "text-text-tertiary"
        )}
      >
        {bill ? formatCurrency(bill.amount) : "—"}
      </span>
      {/* The space is held either way so the grid stays square; only a real
          bill is drawn. */}
      <span className="mt-1.5 block h-2.5">
        {bill ? <Bar share={largest > 0 ? bill.amount / largest : 0} ink={OUT_INK} /> : null}
      </span>
    </button>
  );
}

/**
 * One account, opened: what it has done, one year at a time.
 *
 * The year is stepped rather than scrolled, so a fourth year of history costs
 * nothing in height — which is the whole point, since the previous version could
 * not reach a fourth year at all.
 */
function AccountDetail({
  entry,
  periodMonth,
  onSetBill,
  onDeleteBill,
  onRename,
  onSetBucket,
  onDelete
}: {
  entry: UtilityAccountBills;
  periodMonth: string;
  onSetBill: (billPeriodMonth: string, amount: number) => void;
  onDeleteBill: (bill: UtilityBill, billPeriodMonth: string) => void;
  onRename: (name: string) => void;
  onSetBucket: (bucket: UtilityBucket) => void;
  onDelete: () => void;
}) {
  const { account, bills } = entry;
  const pageYear = Number(periodMonth.slice(0, 4));

  const [name, setName] = useState(account.name);
  const [year, setYear] = useState(pageYear);
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  const months = monthsOfYear(bills, year);
  // Scaled across every bill on the account, not just this year's: a per-year
  // scale would redraw 2023 at the same lengths as 2026 and hide exactly the
  // drift the section exists to show.
  const largest = bills.reduce((most, bill) => Math.max(most, bill.amount), 0);

  const billed = months.filter((month) => month.bill !== null);
  const yearTotal = billed.reduce((total, month) => total + (month.bill?.amount ?? 0), 0);

  // How far back the years go. The clock is never read: the page's own month is
  // what "now" means, so the same book renders identically on the server and in
  // the browser.
  //
  // The floor is **fixed, not derived from the bills**, and that is the whole
  // point. It was "one year before the first bill", on the reasoning that the
  // range would extend itself as history was entered — which is exactly backwards
  // for the case that matters. An account whose bills start in 2025, or which has
  // none at all, could not reach 2023 to type its history in: you would have had
  // to enter a bill in 2025 to unlock 2024, and one in 2024 to unlock 2023. The
  // years a reader wants are the ones they have paper for, and the app has no
  // way of knowing which those are until they are typed.
  //
  // Ten years covers any household utility history worth entering and keeps the
  // picker one short scroll; a genuinely older bill still opens its own year,
  // because anything earlier than the floor that already has a bill lowers it.
  const BACKFILL_YEARS = 10;
  const lastBillYear = bills.length > 0 ? Number(bills[bills.length - 1].period_month.slice(0, 4)) : pageYear;
  const minYear = Math.min(firstBillYear(bills) ?? pageYear, pageYear - BACKFILL_YEARS);
  const maxYear = Math.max(lastBillYear, pageYear);

  // How many bills each year holds, for the picker — "is there anything in 2024?"
  // answered without stepping into it to find out.
  const billsPerYear = new Map<number, number>();
  bills.forEach((bill) => {
    const billYear = Number(bill.period_month.slice(0, 4));
    billsPerYear.set(billYear, (billsPerYear.get(billYear) ?? 0) + 1);
  });

  function goToYear(next: number) {
    setYear(next);
    setEditingMonth(null);
  }

  function startEditing(month: string) {
    const existing = billFor(bills, month);
    setEditingMonth(month);
    setAmount(existing ? String(existing.amount) : "");
  }

  function save() {
    if (editingMonth === null || !amount.trim()) return;
    onSetBill(editingMonth, parseAmount(amount));
    setEditingMonth(null);
  }

  function commitName() {
    const next = name.trim();
    if (!next) {
      setName(account.name);
      return;
    }
    if (next !== account.name) onRename(next);
  }

  const editingBill = editingMonth ? billFor(bills, editingMonth) : null;

  return (
    <div className="bg-subtle/50 px-3.5 py-2.5 sm:px-4 sm:py-3">
      {/* Where this bill lands on the month. It is a caption rather than a field
          because it is set once per account and read every time the row opens. */}
      <BucketPicker value={account.bucket} onChange={onSetBucket} />

      <TrendStrip bills={bills} year={year} />

      {/* The arrows sit either side of the year they move, not at the two ends
          of the row: a control whose halves are 300px apart was the mistake the
          month picker made four times. What the year came to goes at the far
          end, where it is read rather than operated. */}
      <div className="flex items-center gap-0.5">
        <button
          className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-xl text-text-secondary transition-colors duration-200 ease-out hover:bg-surface hover:text-text-primary disabled:opacity-30"
          type="button"
          aria-label={`Show ${year - 1}`}
          disabled={year <= minYear}
          onClick={() => goToYear(year - 1)}
        >
          <ChevronLeft size={18} strokeWidth={1.9} />
        </button>
        <YearPicker
          year={year}
          minYear={minYear}
          maxYear={maxYear}
          billsPerYear={billsPerYear}
          onChange={goToYear}
        />
        <button
          className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-xl text-text-secondary transition-colors duration-200 ease-out hover:bg-surface hover:text-text-primary disabled:opacity-30"
          type="button"
          aria-label={`Show ${year + 1}`}
          disabled={year >= maxYear}
          onClick={() => goToYear(year + 1)}
        >
          <ChevronRight size={18} strokeWidth={1.9} />
        </button>
        {/* What the year came to, and nothing else. It read "12 bills · $1,272.60"
            until the controls beside it grew, at which point it clipped at 360px
            — and the count was the half that was being stated twice, since the
            grid directly underneath shows exactly which months are filled. The
            count still earns its place in the picker, where those years cannot be
            seen. A year with no bills says nothing here; twelve dashes below
            already say it. */}
        {billed.length > 0 ? (
          <span className="ml-auto truncate pl-2 text-meta tabular-nums text-text-tertiary">
            {formatCurrency(yearTotal)}
          </span>
        ) : null}
      </div>

      {/* Three across on a phone, six on a desktop — either way the whole year is
          on screen at once, which twelve 44px rows never were. */}
      <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {months.map(({ periodMonth: month, monthIndex, bill }) => (
          <MonthCell
            key={month}
            periodMonth={month}
            monthIndex={monthIndex}
            bill={bill}
            largest={largest}
            selected={editingMonth === month}
            onSelect={() => startEditing(month)}
          />
        ))}
      </div>

      {/* One form, under the month it belongs to, naming it outright — the grid
          cell above is lit at the same time, so which month is being typed into
          is never a question. */}
      {editingMonth ? (
        /* **The field is the last thing in this block, and that is the whole
           point on a phone.**
           
           Focusing an input raises the iOS keyboard, and Safari scrolls that
           input into view over whatever is left of the page — which with the
           number pad and the URL bar is about 380pt of an 844pt screen. Anything
           *below* the field is therefore under the keyboard, and this block had
           the buttons there: Save and Cancel were sliced in half by the URL bar
           the moment a bill was typed.
           
           So on a phone the label and the controls share the first line and the
           field takes the whole of the second. Whatever Safari scrolls to bring
           the field into view now necessarily leaves the row above it on screen,
           without measuring the keyboard or fighting Safari for the scroll
           position. The field also ends up wider than it was — the full line
           rather than 244px of it.
           
           `order` rather than two copies of the buttons: a desktop has no
           keyboard to dodge, so from `sm` it goes back to one row, label, field,
           controls. */
        <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
          <span className="order-1 w-[68px] shrink-0 text-meta text-text-secondary sm:w-[86px]">
            {periodMonthShortLabel(editingMonth)}
          </span>
          <input
            className="focus-ring order-3 min-h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-right text-label tabular-nums text-text-primary placeholder:text-text-tertiary sm:order-2 sm:w-auto sm:flex-1"
            value={amount}
            aria-label={`Bill for ${periodMonthLabel(editingMonth)}`}
            placeholder="0.00"
            inputMode="decimal"
            autoFocus
            onChange={(event) => setAmount(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
              if (event.key === "Escape") setEditingMonth(null);
            }}
          />
          <div className="order-2 flex flex-1 items-center justify-end gap-1.5 sm:order-3 sm:flex-none">
            {/* Deleting a bill is offered only while its month is open — a trash
                on all twelve cells would be one mis-tap from losing a figure —
                and it stays at the far end from Save, across the row rather than
                beside it. It still asks. */}
            {editingBill ? (
              <SquareButton
                label={`Delete the ${periodMonthLabel(editingMonth)} bill`}
                tone="danger"
                className="mr-auto sm:mr-0"
                onClick={() => {
                  onDeleteBill(editingBill, editingMonth);
                  setEditingMonth(null);
                }}
              >
                <Trash2 size={16} strokeWidth={1.8} />
              </SquareButton>
            ) : null}
            <SquareButton label="Cancel" onClick={() => setEditingMonth(null)}>
              <X size={17} strokeWidth={1.9} />
            </SquareButton>
            <SquareButton label="Save this bill" tone="accent" disabled={!amount.trim()} onClick={save}>
              <Check size={17} strokeWidth={2} />
            </SquareButton>
          </div>
        </div>
      ) : null}

      {/* One row: the name, and the one action that destroys history. Red at
          rest, because a phone has no hover to turn it red on. */}
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/60 pt-2.5">
        <input
          className="focus-ring min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-label text-text-primary sm:max-w-[320px]"
          value={name}
          aria-label="Utility name"
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <SquareButton label={`Delete ${account.name}`} tone="danger" onClick={onDelete}>
          <Trash2 size={16} strokeWidth={1.8} />
        </SquareButton>
      </div>
    </div>
  );
}

/** A 44px square control. Tone at rest, never on a hover a phone cannot do. */
function SquareButton({
  label,
  tone = "plain",
  disabled,
  className,
  onClick,
  children
}: {
  label: string;
  tone?: "plain" | "danger" | "accent";
  disabled?: boolean;
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={cn(
        "focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition-colors duration-200 ease-out disabled:opacity-40",
        tone === "danger"
          ? "border-danger/30 bg-danger-soft/50 text-danger hover:bg-danger-soft"
          : tone === "accent"
            ? "border-transparent bg-accent text-text-primary hover:brightness-95"
            : "border-border bg-surface text-text-secondary hover:bg-subtle hover:text-text-primary",
        className
      )}
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function UtilityGroups({
  book,
  periodMonth,
  onAddAccount,
  onRename,
  onSetBucket,
  onDeleteAccount,
  onSetBill,
  onDeleteBill
}: {
  book: UtilityBook;
  periodMonth: string;
  onAddAccount: (input: { name: string; bucket: UtilityBucket }) => void;
  onRename: (accountId: string, name: string) => void;
  onSetBucket: (accountId: string, bucket: UtilityBucket) => void;
  onDeleteAccount: (entry: UtilityAccountBills) => void;
  onSetBill: (accountId: string, billPeriodMonth: string, amount: number) => void;
  onDeleteBill: (bill: UtilityBill, billPeriodMonth: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBucket, setNewBucket] = useState<UtilityBucket>(DEFAULT_UTILITY_BUCKET);

  const monthTotal = book.reduce((total, entry) => total + monthValue(entry.bills, periodMonth).amount, 0);

  function submitNew() {
    const name = newName.trim();
    if (!name) return;
    onAddAccount({ name, bucket: newBucket });
    setAdding(false);
  }

  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      {/* The strip says what the sheet's title cannot: which month these figures
          are for, and what they come to together. */}
      <div className="flex items-center gap-2.5 bg-[#F4F2EC] px-3.5 py-2 sm:px-4">
        <h2 className="min-w-0 flex-1 truncate text-label font-medium tracking-[-0.01em] text-text-primary sm:text-subhead">
          {periodMonthLabel(periodMonth)}
        </h2>
        <span className="shrink-0 text-label font-medium tabular-nums text-text-primary">
          {formatCurrency(monthTotal)}
        </span>
        <button
          className="focus-ring -my-1.5 -mr-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-text-secondary transition-colors duration-200 ease-out hover:bg-surface hover:text-text-primary"
          type="button"
          aria-label="Add a utility"
          onClick={() => {
            setAdding((current) => !current);
            setNewName("");
            setNewBucket(DEFAULT_UTILITY_BUCKET);
            setOpenId(null);
          }}
        >
          <Plus size={17} strokeWidth={2} />
        </button>
      </div>

      {adding ? (
        <div className="border-t border-border/60 bg-accent-soft/30 px-3.5 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-center gap-1.5">
            <input
              className="focus-ring min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-label text-text-primary placeholder:text-text-tertiary"
              value={newName}
              aria-label="What this bill is for"
              placeholder="Water"
              autoFocus
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitNew();
                if (event.key === "Escape") setAdding(false);
              }}
            />
            <SquareButton label="Cancel" onClick={() => setAdding(false)}>
              <X size={17} strokeWidth={1.9} />
            </SquareButton>
            <SquareButton label="Add this utility" tone="accent" disabled={!newName.trim()} onClick={submitNew}>
              <Check size={17} strokeWidth={2} />
            </SquareButton>
          </div>
          <BucketPicker value={newBucket} onChange={setNewBucket} />
        </div>
      ) : null}

      {book.length === 0 && !adding ? (
        <p className="border-t border-border/60 px-3.5 py-3 text-list text-text-tertiary sm:px-4">
          Nothing metered yet. Add water, power or gas with ＋.
        </p>
      ) : null}

      <div className="divide-y divide-border/60">
        {book.map((entry) => {
          const open = openId === entry.account.id;
          const value = monthValue(entry.bills, periodMonth);

          return (
            <div key={entry.account.id}>
              <button
                className="focus-ring flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors duration-200 ease-out hover:bg-subtle/60 sm:px-4 sm:py-2.5"
                type="button"
                aria-expanded={open}
                onClick={() => {
                  setOpenId(open ? null : entry.account.id);
                  setAdding(false);
                }}
              >
                {/* Colour as identity, never as a quantity: which section this
                    bill lands in, the same hue the month uses for that block. */}
                <span
                  aria-hidden
                  className={cn("h-4 w-1.5 shrink-0 rounded-full", SECTION_STYLE[entry.account.bucket].color)}
                />
                <span className="min-w-0 flex-1 truncate text-body text-text-secondary sm:text-label">
                  {entry.account.name}
                </span>
                <span className="shrink-0 text-right text-body tabular-nums text-text-primary sm:w-[130px] sm:text-label">
                  {/* An account with no bill at all is not worth $0.00 — that is
                      a zero pretending to be a figure. */}
                  {value.basis === "none" ? (
                    <span className="text-text-tertiary">—</span>
                  ) : (
                    <>
                      {formatCurrency(value.amount)}
                      {value.basis === "estimate" ? (
                        <span className="ml-1 text-micro font-normal text-text-tertiary">est</span>
                      ) : null}
                    </>
                  )}
                </span>
                <ChevronDown
                  size={15}
                  strokeWidth={1.8}
                  className={cn(
                    "shrink-0 text-text-tertiary transition-transform duration-200 ease-out",
                    open && "rotate-180"
                  )}
                />
              </button>

              {open ? (
                <AccountDetail
                  entry={entry}
                  periodMonth={periodMonth}
                  onSetBill={(billMonth, billAmount) => onSetBill(entry.account.id, billMonth, billAmount)}
                  onDeleteBill={onDeleteBill}
                  onRename={(name) => onRename(entry.account.id, name)}
                  onSetBucket={(bucket) => onSetBucket(entry.account.id, bucket)}
                  onDelete={() => onDeleteAccount(entry)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

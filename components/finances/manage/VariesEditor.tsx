"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { AnchoredPanel } from "@/components/ui/AnchoredPanel";
import { Bar, OUT_INK } from "@/components/finances/chart";
import {
  AmountInput,
  BucketPicker,
  FormHeader,
  IconButton,
  NameInput,
  parseAmount
} from "@/components/finances/manage/controls";
import { billYearRange, billsPerYear } from "@/lib/financeEntries";
import { MONTHS } from "@/lib/months";
import { periodMonthLabel } from "@/lib/expenses";
import { formatCurrency } from "@/lib/formatters";
import { billFor, monthsOfYear, periodMonthOf, utilityTrend } from "@/lib/utilities";
import { UTILITY_BUCKETS } from "@/types/utility";
import type { UtilityAccountBills, UtilityBill, UtilityBucket } from "@/types/utility";
import type { FinanceBucket } from "@/types/finance";

/**
 * A figure that is different every month.
 *
 * Water, power, gas. A schedule cannot hold these — recording them that way
 * would mean typing twelve dated "changes" a year — and the question they raise
 * is one a schedule could not answer anyway: **is it creeping up?**
 *
 * So the editor is a year of months, and the month you tap is where that month's
 * bill is typed. One form, in the place the figure is read, which is the rule
 * the other editor arrived at too.
 */

/** "+12%" / "−4%" — the direction is the sign, and nothing here says what to do about it. */
function changeLabel(change: number | null) {
  if (change === null) return "—";
  const percent = Math.round(change * 100);
  if (percent === 0) return "No change";
  return `${percent > 0 ? "+" : "−"}${Math.abs(percent)}%`;
}

/** Three figures, one set of chrome, naming the two years they compare. */
function TrendStrip({ bills, year }: { bills: UtilityBill[]; year: number }) {
  const { recentAverage, priorAverage, change } = utilityTrend(bills, periodMonthOf(year, 11));

  const cells = [
    { label: `${year} avg`, value: recentAverage === null ? "—" : formatCurrency(recentAverage) },
    { label: `${year - 1} avg`, value: priorAverage === null ? "—" : formatCurrency(priorAverage) },
    { label: "Change", value: changeLabel(change) }
  ];

  return (
    <div className="grid grid-cols-3 divide-x divide-border/60 border-t border-border/60">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 px-2.5 py-2 sm:px-3.5">
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
 * The arrows are for the step made most — last year, next year — and the label
 * opens the rest, because a reader with paper from 2023 should not tap three
 * times to reach it. The count beside each year answers "is there anything in
 * 2024?" without stepping into it to find out.
 */
function YearPicker({
  year,
  minYear,
  maxYear,
  counts,
  onChange
}: {
  year: number;
  minYear: number;
  maxYear: number;
  counts: Map<number, number>;
  onChange: (next: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index);

  return (
    <>
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
          const count = counts.get(option) ?? 0;
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
 * redrawing the same bars at a new scale each year — the one thing that would
 * make this chart lie. A month with no bill draws no mark; it keeps its space so
 * the grid stays square, because an empty track is a bar drawn for a quantity
 * that does not exist.
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
      <span className="mt-1.5 block h-2.5">
        {bill ? <Bar share={largest > 0 ? bill.amount / largest : 0} ink={OUT_INK} /> : null}
      </span>
    </button>
  );
}

export function VariesEditor({
  entry,
  pageYear,
  focusMonth,
  onRename,
  onMove,
  onSetBill,
  onDeleteBill,
  onDelete
}: {
  entry: UtilityAccountBills;
  /** The year the Finances page is sitting on — what "now" means, without reading the clock. */
  pageYear: number;
  /**
   * A month to open on. The waiting-bill chips hand one over, so tapping
   * "Water · August" lands on August with the field already focused rather than
   * on a year grid to hunt through.
   */
  focusMonth?: string | null;
  onRename: (name: string) => void;
  onMove: (bucket: UtilityBucket) => void;
  onSetBill: (periodMonth: string, amount: number) => void;
  onDeleteBill: (bill: UtilityBill, periodMonth: string) => void;
  onDelete: () => void;
}) {
  const { account, bills } = entry;

  const [name, setName] = useState(account.name);
  const [year, setYear] = useState(() => Number((focusMonth ?? "").slice(0, 4)) || pageYear);
  const [editingMonth, setEditingMonth] = useState<string | null>(focusMonth ?? null);
  const [amount, setAmount] = useState(() => {
    const existing = focusMonth ? billFor(bills, focusMonth) : null;
    return existing ? String(existing.amount) : "";
  });

  // Asking for a different month — a second waiting bill tapped while this one
  // is open — moves the year and the open cell with it.
  useEffect(() => {
    if (!focusMonth) return;
    setYear(Number(focusMonth.slice(0, 4)));
    setEditingMonth(focusMonth);
    const existing = billFor(bills, focusMonth);
    setAmount(existing ? String(existing.amount) : "");
  }, [bills, focusMonth]);

  const months = monthsOfYear(bills, year);
  const largest = bills.reduce((most, bill) => Math.max(most, bill.amount), 0);
  const billed = months.filter((month) => month.bill !== null);
  const yearTotal = billed.reduce((total, month) => total + (month.bill?.amount ?? 0), 0);
  const { minYear, maxYear } = billYearRange(entry, pageYear);
  const counts = billsPerYear(entry);

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
    <div className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      <div className="flex flex-col gap-1.5 px-3.5 py-3 sm:flex-row sm:items-center sm:px-4">
        <NameInput className="sm:max-w-[320px]" value={name} label="Name" onChange={setName} onCommit={commitName} />
        <BucketPicker
          value={account.bucket}
          allowed={UTILITY_BUCKETS as FinanceBucket[]}
          onChange={(bucket) => onMove(bucket as UtilityBucket)}
          className="sm:ml-auto"
        />
      </div>

      {/* Is it going up — the reason this kind of figure has a history at all.
          Stated as figures; nothing here says what to do about it. */}
      <TrendStrip bills={bills} year={year} />

      {/* The form, above the grid rather than under it. Buttons above fields is
          the keyboard rule; the grid below is what the field is typed against,
          and it stays on screen because the field sits at the top of the
          scroller rather than at the bottom of it. */}
      {editingMonth ? (
        <div className="border-t border-border/60 bg-accent-soft/30 px-3.5 py-3 sm:px-4">
          <FormHeader
            title={periodMonthLabel(editingMonth)}
            saveLabel="Save bill"
            saveDisabled={!amount.trim()}
            onSave={save}
            onCancel={() => setEditingMonth(null)}
            onDelete={
              editingBill
                ? () => {
                    onDeleteBill(editingBill, editingMonth);
                    setEditingMonth(null);
                  }
                : undefined
            }
          />
          <AmountInput
            value={amount}
            label={`Bill for ${periodMonthLabel(editingMonth)}`}
            autoFocus
            onChange={setAmount}
            onEnter={save}
          />
        </div>
      ) : null}

      {/* The year row, and the year printed once. It was a block header titled
          "2026" with a picker beside it also reading 2026 — the same fact twice
          on one line. The picker is the title: it says which year and opens the
          rest, and the arrows sit either side of it rather than at the two ends
          of the row, which is the mistake the month picker made four times. */}
      <div className="flex items-center gap-0.5 bg-[#F4F2EC] px-2.5 py-1 sm:px-3">
        <button
          className="focus-ring grid h-11 w-9 shrink-0 place-items-center rounded-xl text-text-secondary transition-colors duration-200 ease-out hover:bg-surface hover:text-text-primary disabled:opacity-30"
          type="button"
          aria-label={`Show ${year - 1}`}
          disabled={year <= minYear}
          onClick={() => goToYear(year - 1)}
        >
          <ChevronLeft size={18} strokeWidth={1.9} />
        </button>
        <YearPicker year={year} minYear={minYear} maxYear={maxYear} counts={counts} onChange={goToYear} />
        <button
          className="focus-ring grid h-11 w-9 shrink-0 place-items-center rounded-xl text-text-secondary transition-colors duration-200 ease-out hover:bg-surface hover:text-text-primary disabled:opacity-30"
          type="button"
          aria-label={`Show ${year + 1}`}
          disabled={year >= maxYear}
          onClick={() => goToYear(year + 1)}
        >
          <ChevronRight size={18} strokeWidth={1.9} />
        </button>
        {/* What the year came to, at the end where it is read rather than
            operated. A year with no bills says nothing; twelve dashes below
            already say it. */}
        {billed.length > 0 ? (
          <span className="ml-auto truncate pl-2 text-label font-medium tabular-nums text-text-primary">
            {formatCurrency(yearTotal)}
          </span>
        ) : null}
      </div>

      {/* Three across on a phone, six on a desktop — either way the whole year is
          on screen at once, which twelve 44px rows never were. */}
      <div className="grid grid-cols-3 gap-1.5 px-3.5 py-3 sm:grid-cols-6 sm:px-4">
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

      <div className="flex items-center justify-end border-t border-border/60 px-3.5 py-2.5 sm:px-4">
        <IconButton label={`Delete ${account.name}`} tone="danger" onClick={onDelete}>
          <Trash2 size={16} strokeWidth={1.8} />
        </IconButton>
      </div>
    </div>
  );
}

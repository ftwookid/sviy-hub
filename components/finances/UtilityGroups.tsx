"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { AnchoredPanel } from "@/components/ui/AnchoredPanel";
import { Bar, OUT_INK } from "@/components/finances/chart";
import { SECTION_STYLE } from "@/lib/finances";
import { periodMonthLabel, periodMonthShortLabel } from "@/lib/expenses";
import { formatCurrency } from "@/lib/formatters";
import { billFor, monthValue, monthsEnding, utilityTrend } from "@/lib/utilities";
import { DEFAULT_UTILITY_BUCKET, UTILITY_BUCKETS } from "@/types/utility";
import type { UtilityAccountBills, UtilityBook, UtilityBucket } from "@/types/utility";

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
 * So there is no separate entry form: the months are the rows, and the row for a
 * month **is** where that month's bill is typed. That is the same rule the Setup
 * panel arrived at the hard way — one form, in the place the figure is read, so
 * there are never two identical forms on a card to type a figure into the wrong
 * one of.
 */

/** How many months the chart shows, ending at the month the page is on. */
const WINDOW = 12;

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
        <span className="flex min-w-0 items-center gap-0.5 rounded-md px-1 py-0.5 text-[11.5px] text-text-tertiary transition-colors duration-200 ease-out group-hover:bg-surface group-hover:text-text-secondary">
          <span className="truncate">Counted in {SECTION_STYLE[value].title}</span>
          <ChevronDown size={12} strokeWidth={2} className="shrink-0" />
        </span>
      </button>

      <AnchoredPanel anchorRef={triggerRef} open={open} onClose={() => setOpen(false)} width={224} className="p-1.5">
        {UTILITY_BUCKETS.map((bucket) => (
          <button
            key={bucket}
            className={cn(
              "focus-ring flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-[14px] transition-colors duration-200 ease-out",
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

/** Three figures, one set of chrome — the house pattern, without a card of its own. */
function TrendStrip({ bills, periodMonth }: { bills: UtilityAccountBills["bills"]; periodMonth: string }) {
  const { recentAverage, priorAverage, change } = utilityTrend(bills, periodMonth);

  const cells: { label: string; value: string }[] = [
    { label: "12-mo avg", value: recentAverage === null ? "—" : formatCurrency(recentAverage) },
    { label: "Year before", value: priorAverage === null ? "—" : formatCurrency(priorAverage) },
    { label: "Change", value: changeLabel(change) }
  ];

  return (
    <div className="mb-2.5 grid grid-cols-3 divide-x divide-border/60 rounded-xl border border-border/60 bg-surface">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 px-2.5 py-2">
          <div className="truncate text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
            {cell.label}
          </div>
          <div className="mt-0.5 truncate text-[15px] font-medium tabular-nums leading-none text-text-primary">
            {cell.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * One account, opened: what it has done, and where this month's bill is typed.
 *
 * Oldest at the top. A bill list is read for a direction, and a direction read
 * downwards is what everybody already means by "going up" — the same order the
 * Reports breakdown and the year list use.
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
  onDeleteBill: (billId: string) => void;
  onRename: (name: string) => void;
  onSetBucket: (bucket: UtilityBucket) => void;
  onDelete: () => void;
}) {
  const { account, bills } = entry;
  const [name, setName] = useState(account.name);
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  const months = monthsEnding(bills, periodMonth, WINDOW);
  // One scale down the column, so a bar's length means the same thing in every
  // row of it — the same rule the month breakdown follows across its blocks.
  const largest = Math.max(...months.map((month) => month.bill?.amount ?? 0), 0);

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

  return (
    <div className="bg-subtle/50 px-3.5 py-2.5 sm:px-4 sm:py-3">
      {/* Where this bill lands on the month. It is a caption rather than a field
          because it is set once per account and read every time the row opens. */}
      <BucketPicker value={account.bucket} onChange={onSetBucket} />

      <TrendStrip bills={bills} periodMonth={periodMonth} />

      <div className="divide-y divide-border/50">
        {months.map(({ periodMonth: month, bill }) =>
          editingMonth === month ? (
            /* The month's row becomes the field, in place. A form anywhere else
               on the card would leave the reader checking which month they were
               about to type into. */
            <div key={month} className="flex min-h-11 items-center gap-1.5 py-1.5">
              <span className="w-[68px] shrink-0 text-[12.5px] text-text-secondary sm:w-[86px]">
                {periodMonthShortLabel(month)}
              </span>
              <input
                className="focus-ring min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-right text-[15px] tabular-nums text-text-primary placeholder:text-text-tertiary"
                value={amount}
                aria-label={`Bill for ${periodMonthLabel(month)}`}
                placeholder="0.00"
                inputMode="decimal"
                autoFocus
                onChange={(event) => setAmount(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") save();
                  if (event.key === "Escape") setEditingMonth(null);
                }}
              />
              {/* Deleting a bill is offered only while its row is open — a trash
                  icon on twelve rows is one mis-tap from losing a figure — and it
                  sits at the far end from Save. */}
              {bill ? (
                <SquareButton
                  label={`Delete the ${periodMonthLabel(month)} bill`}
                  tone="danger"
                  onClick={() => {
                    onDeleteBill(bill.id);
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
          ) : (
            <button
              key={month}
              // 44px, like everything else that is tapped. These rows are the
              // chart *and* the way a bill is entered, so a comfortable target
              // here is not chrome — it is the control.
              className="focus-ring -mx-1.5 flex min-h-11 w-[calc(100%+12px)] items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors duration-200 ease-out hover:bg-surface"
              type="button"
              aria-label={
                bill
                  ? `Edit the ${periodMonthLabel(month)} bill of ${formatCurrency(bill.amount)}`
                  : `Enter the ${periodMonthLabel(month)} bill`
              }
              onClick={() => startEditing(month)}
            >
              <span className="w-[68px] shrink-0 text-[12.5px] text-text-secondary sm:w-[86px]">
                {periodMonthShortLabel(month)}
              </span>
              {/* No mark for a month with no bill: an empty track is a bar drawn
                  for a quantity that does not exist. The row stays, because it is
                  where that month's bill gets typed. */}
              <span className="min-w-0 flex-1">
                {bill ? <Bar share={largest > 0 ? bill.amount / largest : 0} ink={OUT_INK} /> : null}
              </span>
              <span className="w-[80px] shrink-0 text-right text-[13px] tabular-nums text-text-primary">
                {bill ? formatCurrency(bill.amount) : <span className="text-text-tertiary">—</span>}
              </span>
            </button>
          )
        )}
      </div>

      {/* One row: the name, and the one action that destroys history. Red at
          rest, because a phone has no hover to turn it red on. */}
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/60 pt-2.5">
        <input
          className="focus-ring min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-[15px] text-text-primary sm:max-w-[320px]"
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
  onClick,
  children
}: {
  label: string;
  tone?: "plain" | "danger" | "accent";
  disabled?: boolean;
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
            : "border-border bg-surface text-text-secondary hover:bg-subtle hover:text-text-primary"
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
  onDeleteBill: (billId: string) => void;
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
        <h2 className="min-w-0 flex-1 truncate text-[16px] font-medium tracking-[-0.01em] text-text-primary sm:text-[17px]">
          {periodMonthLabel(periodMonth)}
        </h2>
        <span className="shrink-0 text-[15px] font-medium tabular-nums text-text-primary sm:text-[16px]">
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
              className="focus-ring min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-[15px] text-text-primary placeholder:text-text-tertiary"
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
        <p className="border-t border-border/60 px-3.5 py-3 text-[13px] text-text-tertiary sm:px-4">
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
                <span className="min-w-0 flex-1 truncate text-[14px] text-text-secondary sm:text-[15px]">
                  {entry.account.name}
                </span>
                <span className="shrink-0 text-right text-[14px] tabular-nums text-text-primary sm:w-[130px] sm:text-[15px]">
                  {/* An account with no bill at all is not worth $0.00 — that is
                      a zero pretending to be a figure. */}
                  {value.basis === "none" ? (
                    <span className="text-text-tertiary">—</span>
                  ) : (
                    <>
                      {formatCurrency(value.amount)}
                      {value.basis === "estimate" ? (
                        <span className="ml-1 text-[10px] font-normal text-text-tertiary">est</span>
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

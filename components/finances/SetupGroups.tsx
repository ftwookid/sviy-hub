"use client";

import { useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { DateField } from "@/components/ui/DateField";
import { CadencePicker } from "@/components/finances/CadencePicker";
import {
  CADENCE_SUFFIX,
  EDITABLE_BUCKETS,
  SECTION_STYLE,
  currentAmount,
  currentCadence,
  monthlyFromCadence,
  paydayWeekdayFor,
  snapToPayday
} from "@/lib/finances";
import { formatCurrency, formatShortDate, parseLocalDate, todayInputValue } from "@/lib/formatters";
import type { FinanceBucket, FinanceLine, FinanceRate, PayCadence } from "@/types/finance";

/**
 * Every standing figure, and the dated history behind each one — in one card.
 *
 * Five buckets used to be five cards with five headers and five "Add line" rows
 * of their own, which is about 400px spent on chrome for a screen whose content
 * is a handful of names and amounts. Now a bucket is a 32px strip inside one
 * container: its name, what it comes to a month, and a `+`. A line is a row; its
 * history opens underneath it.
 *
 * One line open at a time, across the whole card. The expanded state is tall by
 * nature and two of them at once turns a setup screen into a scroll.
 */

function parseAmount(value: string) {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/**
 * What a non-monthly figure comes to a month, said before it is saved.
 *
 * The conversion is the whole point of the setting, so it is shown while the
 * amount is still being typed. It says **on average**, and it has to: the month
 * itself counts the payments that actually land in it, so a fortnightly line
 * pays twice in most months and three times in two of them. An average that
 * reads as a promise about every month is exactly the misunderstanding this
 * sentence exists to prevent.
 */
function monthlyLine(amountValue: string, cadence: PayCadence) {
  const typed = parseAmount(amountValue);
  if (!typed) return `Paid ${CADENCE_SUFFIX[cadence]}. Each month counts the payments that land in it.`;
  if (cadence === "Monthly") return `${formatCurrency(typed)} a month.`;
  return `${formatCurrency(typed)} ${CADENCE_SUFFIX[cadence]} — ${formatCurrency(
    monthlyFromCadence(typed, cadence)
  )} a month on average. Each month counts the payments that land in it.`;
}

/** "avg" beside a derived monthly figure, wherever the line is not actually monthly. */
function AverageTag({ cadence }: { cadence: PayCadence }) {
  if (cadence === "Monthly") return null;
  return <span className="ml-1 text-[10px] font-normal text-text-tertiary">avg</span>;
}

/** A change being corrected: which row, and the three things it holds. */
type EditingRate = { id: string; date: string; amount: string; cadence: PayCadence };

function longDate(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    parseLocalDate(dateValue)
  );
}

function AmountInput({
  value,
  onChange,
  label,
  onEnter,
  className
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  onEnter?: () => void;
  className?: string;
}) {
  return (
    <input
      className={cn(
        "focus-ring min-h-11 rounded-xl border border-border bg-subtle px-3 text-right text-[15px] tabular-nums text-text-primary placeholder:text-text-tertiary",
        className
      )}
      value={value}
      aria-label={label}
      placeholder="0.00"
      inputMode="decimal"
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && onEnter) onEnter();
      }}
    />
  );
}

function IconButton({
  label,
  tone = "plain",
  disabled,
  onClick,
  children
}: {
  label: string;
  tone?: "plain" | "accent" | "danger";
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={cn(
        "focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors duration-200 ease-out disabled:opacity-40",
        tone === "accent"
          ? "bg-accent-soft text-text-primary hover:bg-accent"
          : tone === "danger"
            ? "text-text-tertiary hover:bg-danger-soft hover:text-danger"
            : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
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

function LineDetail({
  line,
  onRename,
  onSetRate,
  onUpdateRate,
  onDeleteRate,
  onDeleteLine
}: {
  line: FinanceLine;
  onRename: (label: string) => void;
  onSetRate: (effectiveFrom: string, amount: number, cadence: PayCadence) => void;
  onUpdateRate: (rateId: string, effectiveFrom: string, amount: number, cadence: PayCadence) => void;
  onDeleteRate: (rateId: string) => void;
  onDeleteLine: () => void;
}) {
  const [label, setLabel] = useState(line.label);
  const [changeDate, setChangeDate] = useState(todayInputValue());
  const [changeAmount, setChangeAmount] = useState("");
  const [editing, setEditing] = useState<EditingRate | null>(null);
  // A line paid every second week is still paid every second week after a
  // raise, so the change being typed inherits the cadence already in force.
  const [cadence, setCadence] = useState<PayCadence>(() => currentCadence(line.rates));

  // A line with a fixed payday is saved on that payday, whatever date was picked
  // — Ivan may type the Monday of the week his paycheck lands on. Snapping on
  // save rather than only on read means the date shown in the history, the date
  // stored, and the date the month counts are all the same one.
  const payday = paydayWeekdayFor(line.label);
  const paydayNote =
    payday === null
      ? null
      : "Paid on Thursdays. A date anywhere in that week is saved as its Thursday.";

  // Payments from this date on are worth the new amount; the ones before it keep
  // the old one. That is not the same as the old wording, which said the month
  // was "split across both amounts" — months are no longer averaged, they are a
  // count of the payments that landed in them.
  const changeHint = [
    cadence === "Monthly"
      ? "Payments from this date on use the new amount. To stop a line, change it to 0."
      : `${monthlyLine(changeAmount, cadence)} Payments from this date on use the new amount.`,
    // Said where the date is being picked, not afterwards in a toast: the point
    // is that Ivan does not have to know which Thursday it was.
    paydayNote
  ]
    .filter(Boolean)
    .join(" ");

  function saveChange() {
    if (!changeAmount.trim()) return;
    onSetRate(snapToPayday(changeDate, payday), parseAmount(changeAmount), cadence);
    setChangeAmount("");
  }

  function startEditing(rate: FinanceRate) {
    setEditing({
      id: rate.id,
      date: rate.effective_from,
      amount: String(rate.entered_amount),
      cadence: rate.cadence
    });
  }

  function saveEditing() {
    if (!editing || !editing.amount.trim()) return;
    onUpdateRate(editing.id, snapToPayday(editing.date, payday), parseAmount(editing.amount), editing.cadence);
    setEditing(null);
  }

  function commitLabel() {
    const next = label.trim();
    if (!next) {
      setLabel(line.label);
      return;
    }
    if (next !== line.label) onRename(next);
  }

  return (
    <div className="bg-subtle/50 px-3.5 py-2.5 sm:px-4 sm:py-3">
      {line.rates.length > 0 ? (
        <div className="mb-2.5 divide-y divide-border/50">
          {/* Newest first: the change most likely being corrected is the last one
              made. */}
          {[...line.rates].reverse().map((rate) =>
            editing?.id === rate.id ? (
              /* The row becomes the form, in place. Editing a change somewhere
                 else on the card would leave the reader checking which of two
                 identical forms belonged to the figure they tapped. */
              <div key={rate.id} className="py-2">
                <div className="flex flex-wrap items-end gap-1.5 sm:flex-nowrap sm:gap-2">
                  <div className="min-w-0 basis-full sm:basis-auto sm:flex-1 sm:max-w-[260px]">
                    <DateField
                      label="From"
                      value={editing.date}
                      dimFutureDates={false}
                      onChange={(date) => setEditing({ ...editing, date })}
                    />
                  </div>
                  <div className="min-w-0 flex-1 sm:flex-none sm:shrink-0">
                    <CadencePicker
                      value={editing.cadence}
                      onChange={(next) => setEditing({ ...editing, cadence: next })}
                    />
                    <AmountInput
                      className="w-full sm:w-[150px]"
                      label={`Amount ${CADENCE_SUFFIX[editing.cadence]} from this date`}
                      value={editing.amount}
                      onChange={(amount) => setEditing({ ...editing, amount })}
                      onEnter={saveEditing}
                    />
                  </div>
                </div>
                {editing.cadence !== "Monthly" ? (
                  <p className="mt-1.5 text-[11px] text-text-tertiary">
                    {monthlyLine(editing.amount, editing.cadence)}
                  </p>
                ) : null}
                {/* Delete sits at the other end of the row from Save, and only
                    while a change is open: a trash icon on every history row is
                    a mis-tap away from losing a figure somebody typed months
                    ago, and it was the only thing those rows offered. */}
                <div className="mt-1.5 flex items-center justify-between">
                  <IconButton
                    label={`Remove the change from ${longDate(rate.effective_from)}`}
                    tone="danger"
                    onClick={() => {
                      onDeleteRate(rate.id);
                      setEditing(null);
                    }}
                  >
                    <Trash2 size={16} strokeWidth={1.8} />
                  </IconButton>
                  <div className="flex items-center gap-1.5">
                    <IconButton label="Stop editing this change" onClick={() => setEditing(null)}>
                      <X size={16} strokeWidth={1.8} />
                    </IconButton>
                    <IconButton
                      label="Save this change"
                      tone="accent"
                      disabled={!editing.amount.trim()}
                      onClick={saveEditing}
                    >
                      <Check size={17} strokeWidth={2} />
                    </IconButton>
                  </div>
                </div>
              </div>
            ) : (
              <button
                key={rate.id}
                className="focus-ring -mx-1.5 flex w-[calc(100%+12px)] items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors duration-200 ease-out hover:bg-surface"
                type="button"
                aria-label={`Edit the change from ${longDate(rate.effective_from)}`}
                onClick={() => startEditing(rate)}
              >
                <span className="min-w-0 flex-1 text-[13px] text-text-secondary">
                  <span className="block truncate">From {longDate(rate.effective_from)}</span>
                  {/* Only where it says something: a monthly line's typed figure
                      and its monthly figure are the same number. Under the date
                      on a phone; in its own column once there is room, so the
                      dates and the figures each read down a straight edge. */}
                  {rate.cadence !== "Monthly" ? (
                    <span className="block truncate text-[11.5px] text-text-tertiary sm:hidden">
                      {formatCurrency(rate.entered_amount)} {CADENCE_SUFFIX[rate.cadence]}
                    </span>
                  ) : null}
                </span>
                <span className="hidden shrink-0 text-right text-[12.5px] tabular-nums text-text-tertiary sm:block sm:w-[200px]">
                  {rate.cadence === "Monthly"
                    ? ""
                    : `${formatCurrency(rate.entered_amount)} ${CADENCE_SUFFIX[rate.cadence]}`}
                </span>
                <span className="shrink-0 text-right text-[13.5px] font-medium tabular-nums text-text-primary sm:w-[120px]">
                  {formatCurrency(rate.monthly_amount)}
                  <AverageTag cadence={rate.cadence} />
                </span>
                <Pencil size={13} strokeWidth={1.7} className="shrink-0 text-text-tertiary" />
              </button>
            )
          )}
        </div>
      ) : null}

      {/* Date, amount, save — one row. The date field is flexible and the amount
          fixed and narrow, which is what keeps the date on a single line at
          390px; it wrapped when both were fighting for the same width.

          Hidden while a change is being corrected: two identical forms on one
          card, one adding and one editing, is a way to type a raise into the
          wrong one. */}
      {editing ? null : (
        <>
      <div className="flex flex-wrap items-end gap-1.5 sm:flex-nowrap sm:gap-2">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1 sm:max-w-[260px]">
          <DateField label="From" value={changeDate} dimFutureDates={false} onChange={setChangeDate} />
        </div>
        <div className="min-w-0 flex-1 sm:flex-none sm:shrink-0">
          <CadencePicker value={cadence} onChange={setCadence} />
          <AmountInput
            className="w-full sm:w-[150px]"
            label={`Amount ${CADENCE_SUFFIX[cadence]} from this date`}
            value={changeAmount}
            onChange={setChangeAmount}
            onEnter={saveChange}
          />
        </div>
        <IconButton label="Save this change" tone="accent" disabled={!changeAmount.trim()} onClick={saveChange}>
          <Check size={17} strokeWidth={2} />
        </IconButton>
        {/* Beside the amount it is about, on a screen with room for it — the
            same sentence stacked underneath left the right half of an 880px row
            empty and cost a line of height. */}
        <p className="hidden min-w-0 text-[11.5px] leading-snug text-text-tertiary sm:block sm:flex-1 sm:self-center sm:pl-1">
          {changeHint}
        </p>
      </div>
      <p className="mt-1.5 text-[11px] text-text-tertiary sm:hidden">{changeHint}</p>
        </>
      )}

      <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/60 pt-2.5">
        <input
          className="focus-ring min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-[15px] text-text-primary sm:max-w-[320px]"
          value={label}
          aria-label="Line name"
          onChange={(event) => setLabel(event.target.value)}
          onBlur={commitLabel}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <IconButton label={`Delete ${line.label}`} tone="danger" onClick={onDeleteLine}>
          <Trash2 size={16} strokeWidth={1.8} />
        </IconButton>
      </div>
    </div>
  );
}

export function SetupGroups({
  lines,
  onAddLine,
  onRename,
  onSetRate,
  onUpdateRate,
  onDeleteRate,
  onDeleteLine
}: {
  lines: FinanceLine[];
  onAddLine: (input: {
    bucket: FinanceBucket;
    label: string;
    amount: number;
    cadence: PayCadence;
    effectiveFrom: string;
  }) => void;
  onRename: (lineId: string, label: string) => void;
  onSetRate: (lineId: string, effectiveFrom: string, amount: number, cadence: PayCadence) => void;
  onUpdateRate: (rateId: string, effectiveFrom: string, amount: number, cadence: PayCadence) => void;
  onDeleteRate: (rateId: string) => void;
  onDeleteLine: (line: FinanceLine) => void;
}) {
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const [addingBucket, setAddingBucket] = useState<FinanceBucket | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newFrom, setNewFrom] = useState(todayInputValue());
  const [newCadence, setNewCadence] = useState<PayCadence>("Monthly");

  function startAdding(bucket: FinanceBucket) {
    setAddingBucket(bucket);
    setOpenLineId(null);
    setNewLabel("");
    setNewAmount("");
    setNewFrom(todayInputValue());
    setNewCadence("Monthly");
  }

  function submitNew(bucket: FinanceBucket) {
    const label = newLabel.trim();
    if (!label) return;
    onAddLine({ bucket, label, amount: parseAmount(newAmount), cadence: newCadence, effectiveFrom: newFrom });
    setAddingBucket(null);
  }

  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      {EDITABLE_BUCKETS.map((bucket, bucketIndex) => {
        const bucketLines = lines.filter((line) => line.bucket === bucket);
        const inEffect = bucketLines.reduce((total, line) => total + currentAmount(line.rates), 0);
        const style = SECTION_STYLE[bucket];

        return (
          <div key={bucket} className={cn(bucketIndex > 0 && "border-t border-border")}>
            {/* The heading outranks its lines, which is the whole job of a
                heading. It was 10.5px uppercase tertiary over 14px near-black
                rows — a label whispering above the things it was meant to
                govern, so the eye read the lines first and had to hunt upward to
                find out which bucket they were in.

                No blurb under the name: "Before anything is taken out" under
                Gross income tells whoever typed these figures nothing they do
                not know, and six of them cost 96px on a phone. */}
            <div className="flex items-center gap-2.5 bg-[#F4F2EC] px-3.5 py-2 sm:px-4">
              <span aria-hidden className={cn("h-4 w-1.5 shrink-0 rounded-full", style.color)} />
              <h2 className="min-w-0 flex-1 truncate text-[16px] font-medium tracking-[-0.01em] text-text-primary sm:text-[17px]">
                {style.title}
              </h2>
              <span className="shrink-0 text-[15px] font-medium tabular-nums text-text-primary sm:text-[16px]">
                {formatCurrency(inEffect)}
              </span>
              <button
                className="focus-ring -mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-text-secondary transition-colors duration-200 ease-out hover:bg-surface hover:text-text-primary"
                type="button"
                aria-label={`Add a line to ${style.title}`}
                onClick={() => (addingBucket === bucket ? setAddingBucket(null) : startAdding(bucket))}
              >
                <Plus size={17} strokeWidth={2} />
              </button>
            </div>

            {addingBucket === bucket ? (
              /* Name, cadence, amount, date and Save — one row where there is
                 room for one, two where there is not. The wrap points are
                 explicit rather than left to the browser: on a phone the name
                 shares its line with the amount and the date shares its line
                 with the buttons, which is the arrangement that fits 390px
                 without any field dropping below a comfortable width. */
              <div className="border-t border-border/60 bg-accent-soft/30 px-3.5 py-2.5 sm:px-4 sm:py-3">
                <div className="flex flex-wrap items-end gap-1.5 sm:flex-nowrap sm:gap-2">
                  <input
                    className="focus-ring min-h-11 min-w-0 basis-full rounded-xl border border-border bg-surface px-3 text-[15px] text-text-primary placeholder:text-text-tertiary sm:basis-auto sm:flex-1"
                    value={newLabel}
                    aria-label="New line name"
                    placeholder="Name"
                    autoFocus
                    onChange={(event) => setNewLabel(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") submitNew(bucket);
                      if (event.key === "Escape") setAddingBucket(null);
                    }}
                  />
                  <div className="min-w-0 basis-full sm:basis-auto sm:w-[210px]">
                    <DateField label="Starting from" value={newFrom} dimFutureDates={false} onChange={setNewFrom} />
                  </div>
                  <div className="min-w-0 flex-1 sm:flex-none sm:shrink-0">
                    <CadencePicker value={newCadence} onChange={setNewCadence} />
                    <AmountInput
                      className="w-full sm:w-[150px]"
                      label={`New line amount ${CADENCE_SUFFIX[newCadence]}`}
                      value={newAmount}
                      onChange={setNewAmount}
                      onEnter={() => submitNew(bucket)}
                    />
                  </div>
                  <IconButton
                    label="Save new line"
                    tone="accent"
                    disabled={!newLabel.trim()}
                    onClick={() => submitNew(bucket)}
                  >
                    <Check size={17} strokeWidth={2} />
                  </IconButton>
                  <IconButton label="Cancel new line" onClick={() => setAddingBucket(null)}>
                    <X size={16} strokeWidth={1.8} />
                  </IconButton>
                </div>
                {newCadence !== "Monthly" ? (
                  <p className="mt-1.5 text-[11px] text-text-tertiary">{monthlyLine(newAmount, newCadence)}</p>
                ) : null}
              </div>
            ) : null}

            {/* An empty bucket is its strip and nothing else. A "Nothing here
                yet" row per bucket cost 176px on a phone to say what the $0.00
                and the + in the strip above it already say. */}

            <div className="divide-y divide-border/60">
              {bucketLines.map((line) => {
                const open = openLineId === line.id;
                const latest = line.rates[line.rates.length - 1];
                const pending = latest && latest.effective_from > todayInputValue();
                // What the line's last change was, said once and placed twice.
                const meta =
                  line.rates.length === 0
                    ? "No amount set"
                    : pending
                      ? `→ ${formatCurrency(latest.monthly_amount)} on ${formatShortDate(latest.effective_from)}`
                      : `Since ${formatShortDate(latest.effective_from)}${
                          line.rates.length > 1 ? ` · ${line.rates.length} changes` : ""
                        }`;

                return (
                  <div key={line.id}>
                    <button
                      className="focus-ring flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors duration-200 ease-out hover:bg-subtle/60 sm:px-4 sm:py-2.5"
                      type="button"
                      aria-expanded={open}
                      onClick={() => {
                        setOpenLineId(open ? null : line.id);
                        setAddingBucket(null);
                      }}
                    >
                      {/* Label, then when it last changed, then the figure —
                          three columns once there is room for three. Stacking
                          the "Since Dec 21" under the name left 400px of nothing
                          down the middle of an 880px dialog, and made every row
                          two lines tall for a fact that fits on one. */}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-text-secondary sm:text-[15px]">
                          {line.label}
                        </span>
                        <span className="block truncate text-[11.5px] text-text-tertiary sm:hidden">{meta}</span>
                      </span>
                      <span className="hidden shrink-0 truncate text-right text-[12.5px] text-text-tertiary sm:block sm:w-[220px]">
                        {meta}
                      </span>
                      <span className="shrink-0 text-right text-[14px] tabular-nums text-text-primary sm:w-[120px] sm:text-[15px]">
                        {formatCurrency(currentAmount(line.rates))}
                        {line.rates.length > 0 ? <AverageTag cadence={currentCadence(line.rates)} /> : null}
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
                      <LineDetail
                        line={line}
                        onRename={(label) => onRename(line.id, label)}
                        onSetRate={(effectiveFrom, amount, cadence) => onSetRate(line.id, effectiveFrom, amount, cadence)}
                        onUpdateRate={onUpdateRate}
                        onDeleteRate={onDeleteRate}
                        onDeleteLine={() => onDeleteLine(line)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

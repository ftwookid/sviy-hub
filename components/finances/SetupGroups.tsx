"use client";

import { useState } from "react";
import { Check, ChevronDown, CircleSlash, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { DateField } from "@/components/ui/DateField";
import { CadencePicker } from "@/components/finances/CadencePicker";
import {
  CADENCE_SUFFIX,
  EDITABLE_BUCKETS,
  SECTION_STYLE,
  currentAmount,
  currentCadence,
  endedOn,
  monthlyFromCadence,
  paydayWeekdayFor,
  scheduleSummary,
  snapToPayday
} from "@/lib/finances";
import { formatCurrency, parseLocalDate, todayInputValue } from "@/lib/formatters";
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
 * The amount field's label: what the number is, then how often it arrives.
 *
 * The cadence alone was the whole caption, so between `FROM` and `UNTIL` sat a
 * field labelled `2 WEEKS` — which says when, and never says what the number is.
 * The word is plain text; only the cadence beside it opens anything.
 */
function AmountCaption({ value, onChange }: { value: PayCadence; onChange: (next: PayCadence) => void }) {
  return (
    <span className="flex min-h-[19px] items-center gap-1">
      <span className="text-meta font-medium uppercase tracking-[0.04em] text-text-tertiary">Amount</span>
      <span aria-hidden className="text-meta text-text-tertiary/60">
        ·
      </span>
      <CadencePicker value={value} onChange={onChange} />
    </span>
  );
}

/** "avg" beside a derived monthly figure, wherever the line is not actually monthly. */
function AverageTag({ cadence }: { cadence: PayCadence }) {
  if (cadence === "Monthly") return null;
  return <span className="ml-1 text-micro font-normal text-text-tertiary">avg</span>;
}

/** A change being corrected: which row, and the four things it holds. */
type EditingRate = { id: string; date: string; amount: string; cadence: PayCadence; end: string | null };

/**
 * The optional last day an amount is paid.
 *
 * Absent until it is wanted — a permanent second date field on every entry row
 * would charge every raise for a setting most changes never use, and the common
 * case is a commitment that just keeps running. So it is a word until it is a
 * field.
 *
 * When it is a field it takes the whole row like every other field, and the way
 * back to nothing sits on the label line. A ✕ beside the trigger left it 260px
 * of a 308px phone row: the control that undoes the field was given more room
 * than the field.
 */
function EndDateField({
  value,
  from,
  onChange
}: {
  value: string | null;
  from: string;
  onChange: (next: string | null) => void;
}) {
  if (value === null) {
    return (
      <TextButton
        className="w-full self-center sm:w-auto"
        onClick={() => onChange(from > todayInputValue() ? from : todayInputValue())}
      >
        Add an end date
      </TextButton>
    );
  }

  return (
    <div className="min-w-0 sm:flex-1 sm:max-w-[230px]">
      <DateField
        label="Until"
        value={value}
        dimFutureDates={false}
        onChange={(next) => onChange(next)}
        action={
          <button
            // Same trick as the cadence caption: a real target inside a label
            // line that keeps its height, with only the word painted.
            className="focus-ring-child group -my-3 -mr-2 px-2 py-3"
            type="button"
            aria-label="Remove the end date"
            onClick={() => onChange(null)}
          >
            <span className="block rounded-md px-1 py-0.5 text-meta font-medium text-text-tertiary transition-colors duration-200 ease-out group-hover:bg-subtle group-hover:text-text-secondary">
              Remove
            </span>
          </button>
        }
      />
    </div>
  );
}

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
        "focus-ring min-h-11 rounded-xl border border-border bg-subtle px-3 text-right text-label tabular-nums text-text-primary placeholder:text-text-tertiary",
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

/**
 * A quiet, full-height text button — "Add an end date", and nothing louder.
 *
 * It is a word rather than a control on purpose, but it still has to be hittable:
 * at 44px tall and the row's full width on a phone, the tap target matches every
 * field above it instead of being a 112px sliver wedged beside the amount.
 */
function TextButton({
  className,
  onClick,
  children
}: {
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={cn(
        "focus-ring flex min-h-11 items-center rounded-xl px-2 text-left text-list text-text-tertiary transition-colors duration-200 ease-out hover:bg-subtle hover:text-text-secondary",
        className
      )}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * The one shape every committing action in this panel wears.
 *
 * They were three identical 44px grey squares — delete, cancel, save — told
 * apart only by their icon and, for delete, a red **hover** colour. A phone has
 * no hover, so on the screen this panel is actually used on, the button that
 * destroys a figure typed months ago looked exactly like the one that closes the
 * form. Tone is now carried at rest, and every one of them says what it does.
 */
function ActionButton({
  tone,
  disabled,
  onClick,
  className,
  children
}: {
  tone: "primary" | "quiet" | "danger";
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={cn(
        // px-3, not px-4: at 151px — half a 308px phone row — "Delete change"
        // plus its icon needs 121px of the 127 that px-3 leaves, and wrapped to
        // two lines at px-4, which made one of the two buttons on the row 3px
        // taller than the other.
        "focus-ring inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-body font-medium transition-colors duration-200 ease-out disabled:opacity-40 sm:px-4",
        tone === "primary"
          ? "bg-accent text-text-primary hover:brightness-95"
          : tone === "danger"
            ? "border border-danger/30 bg-danger-soft/50 text-danger hover:bg-danger-soft"
            : "border border-border bg-surface text-text-secondary hover:bg-subtle hover:text-text-primary",
        className
      )}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** A square control for the two utility actions that keep a row: stop, delete. */
function IconButton({
  label,
  tone = "plain",
  onClick,
  children
}: {
  label: string;
  tone?: "plain" | "danger";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={cn(
        "focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition-colors duration-200 ease-out",
        tone === "danger"
          ? "border-danger/30 bg-danger-soft/50 text-danger hover:bg-danger-soft"
          : "border-border bg-surface text-text-secondary hover:bg-subtle hover:text-text-primary"
      )}
      type="button"
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * Save, and whatever else the form offers — one row, at every width.
 *
 * Named rather than three identical grey squares, which is what made the button
 * that destroys a figure indistinguishable from the one that closes the form on
 * a screen with no hover. But named does not mean full width: "Delete Cancel
 * Save" is about 220px of a 308px phone row, so stacking them cost two lines of
 * height to say the same thing. Destructive sits at the far left, away from Save.
 */
function FormActions({
  saveLabel,
  saveDisabled,
  onSave,
  onCancel,
  onDelete,
  className
}: {
  saveLabel: string;
  saveDisabled?: boolean;
  onSave: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("mt-2 flex items-center gap-1.5", className)}>
      {onDelete ? (
        <ActionButton tone="danger" onClick={onDelete} className="mr-auto">
          <Trash2 size={15} strokeWidth={1.8} />
          Delete
        </ActionButton>
      ) : null}
      {onCancel ? (
        <ActionButton tone="quiet" onClick={onCancel} className={onDelete ? "" : "ml-auto"}>
          Cancel
        </ActionButton>
      ) : null}
      <ActionButton
        tone="primary"
        disabled={saveDisabled}
        onClick={onSave}
        className={onDelete || onCancel ? "" : "ml-auto"}
      >
        <Check size={16} strokeWidth={2} />
        {saveLabel}
      </ActionButton>
    </div>
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
  onSetRate: (effectiveFrom: string, amount: number, cadence: PayCadence, effectiveTo: string | null) => void;
  onUpdateRate: (
    rateId: string,
    effectiveFrom: string,
    amount: number,
    cadence: PayCadence,
    effectiveTo: string | null
  ) => void;
  onDeleteRate: (rateId: string) => void;
  onDeleteLine: () => void;
}) {
  const [label, setLabel] = useState(line.label);
  const [changeDate, setChangeDate] = useState(todayInputValue());
  const [changeAmount, setChangeAmount] = useState("");
  const [changeEnd, setChangeEnd] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingRate | null>(null);
  // A line paid every second week is still paid every second week after a
  // raise, so the change being typed inherits the cadence already in force.
  const [cadence, setCadence] = useState<PayCadence>(() => currentCadence(line.rates));

  // A line with a fixed payday is saved on that payday, whatever date was picked
  // — Ivan may type the Monday of the week his paycheck lands on. Snapping on
  // save rather than only on read means the date shown in the history, the date
  // stored, and the date the month counts are all the same one.
  const payday = paydayWeekdayFor(line.label);
  // The only sentence left in this panel, and only on the one line that has a
  // fixed payday: it is not description, it is notice that the date typed is
  // about to be moved. Everything else that used to sit under these fields —
  // what the figure comes to a month, that later payments use the new amount —
  // was restating what the row above and the month behind already say.
  const paydayNote = payday === null ? null : "Saved as that week's Thursday.";

  function saveChange() {
    if (!changeAmount.trim()) return;
    onSetRate(snapToPayday(changeDate, payday), parseAmount(changeAmount), cadence, changeEnd);
    setChangeAmount("");
    setChangeEnd(null);
  }

  function startEditing(rate: FinanceRate, end: string | null = rate.effective_to ?? null) {
    setEditing({
      id: rate.id,
      date: rate.effective_from,
      amount: String(rate.entered_amount),
      cadence: rate.cadence,
      end
    });
  }

  function saveEditing() {
    if (!editing || !editing.amount.trim()) return;
    onUpdateRate(
      editing.id,
      snapToPayday(editing.date, payday),
      parseAmount(editing.amount),
      editing.cadence,
      editing.end
    );
    setEditing(null);
  }

  /**
   * Stopping a line is one tap that opens the date it stopped on, not a silent
   * write of today.
   *
   * The last change is the one that is still running, so ending it ends the
   * line; the form it opens in is the same one every other correction uses, and
   * the date is a suggestion until it is saved. Resuming clears the end date
   * outright, because there is nothing to choose about it.
   */
  const latest = line.rates[line.rates.length - 1];
  const stopped = endedOn(line.rates);

  function stopLine() {
    if (!latest) return;
    startEditing(latest, latest.effective_from > todayInputValue() ? latest.effective_from : todayInputValue());
  }

  function resumeLine() {
    if (!latest) return;
    onUpdateRate(latest.id, latest.effective_from, Number(latest.entered_amount), latest.cadence, null);
  }

  function commitLabel() {
    const next = label.trim();
    if (!next) {
      setLabel(line.label);
      return;
    }
    if (next !== line.label) onRename(next);
  }

  const schedule = scheduleSummary(line);

  return (
    <div className="bg-subtle/50 px-3.5 py-2.5 sm:px-4 sm:py-3">
      {/* What the app worked out about when this line is paid. It is inferred
          from the date on the earliest change, and it used to be inferred
          silently — so a change dated before that one re-timed every payment on
          the line and nothing said so. Printed here, where changes are typed. */}
      {schedule ? (
        <p className="mb-2 text-caption text-text-tertiary">{schedule}</p>
      ) : null}
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
                {/* Every field takes the whole row on a phone. They were sharing
                    one: the amount came out 140px of 308 and the end date 260,
                    because the buttons beside them were taking the width the
                    fields needed. */}
                {/* Two per row on a phone: a date and an amount both fit, and
                    giving each its own line cost a wasted half-row twice over. */}
                <div className="grid grid-cols-[1.3fr_1fr] items-end gap-1.5 sm:flex sm:flex-nowrap sm:gap-2">
                  <div className="min-w-0 sm:flex-1 sm:max-w-[260px]">
                    <DateField
                      label="From"
                      value={editing.date}
                      dimFutureDates={false}
                      onChange={(date) => setEditing({ ...editing, date })}
                    />
                  </div>
                  <div className="min-w-0 sm:flex-none sm:shrink-0">
                    <AmountCaption
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
                  <EndDateField
                    value={editing.end}
                    from={editing.date}
                    onChange={(end) => setEditing({ ...editing, end })}
                  />
                  {/* Delete is only offered while a change is open — a trash
                      icon on every history row is a mis-tap away from losing a
                      figure somebody typed months ago — and it is the far end
                      of the row from Save, so it is never on the way there. */}
                </div>
                <FormActions
                  saveLabel="Save change"
                  saveDisabled={!editing.amount.trim()}
                  onSave={saveEditing}
                  onCancel={() => setEditing(null)}
                  onDelete={() => {
                    onDeleteRate(rate.id);
                    setEditing(null);
                  }}
                />
              </div>
            ) : (
              <button
                key={rate.id}
                className="focus-ring -mx-1.5 flex w-[calc(100%+12px)] items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors duration-200 ease-out hover:bg-surface"
                type="button"
                aria-label={`Edit the change from ${longDate(rate.effective_from)}`}
                onClick={() => startEditing(rate)}
              >
                <span className="min-w-0 flex-1 text-list text-text-secondary">
                  {/* The end date belongs on the same line as the start: they
                      are one fact, and a stopped line has to say so where the
                      dates are read rather than only in the month behind. */}
                  <span className="block truncate">
                    From {longDate(rate.effective_from)}
                    {rate.effective_to ? ` → ${longDate(rate.effective_to)}` : ""}
                    {/* The one thing the row's old subtitle said that the dates
                        alone do not: this change has not happened yet. */}
                    {rate.effective_from > todayInputValue() ? (
                      <span className="ml-1.5 rounded-md bg-accent-soft px-1.5 py-0.5 text-micro font-medium text-text-secondary">
                        Upcoming
                      </span>
                    ) : null}
                  </span>
                  {/* Only where it says something: a monthly line's typed figure
                      and its monthly figure are the same number. Under the date
                      on a phone; in its own column once there is room, so the
                      dates and the figures each read down a straight edge. */}
                  {rate.cadence !== "Monthly" ? (
                    <span className="block truncate text-caption text-text-tertiary sm:hidden">
                      {formatCurrency(rate.entered_amount)} {CADENCE_SUFFIX[rate.cadence]}
                    </span>
                  ) : null}
                </span>
                <span className="hidden shrink-0 text-right text-meta tabular-nums text-text-tertiary sm:block sm:w-[200px]">
                  {rate.cadence === "Monthly"
                    ? ""
                    : `${formatCurrency(rate.entered_amount)} ${CADENCE_SUFFIX[rate.cadence]}`}
                </span>
                <span className="shrink-0 text-right text-list font-medium tabular-nums text-text-primary sm:w-[120px]">
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
      {/* One row while it is the usual date-cadence-amount; two once an end date
          is open, because a fourth field leaves the sentence about 130px and
          five lines tall. The wrap point is explicit rather than the browser's
          — nowrap is what keeps the sentence beside the amount it explains. */}
      <div className="grid grid-cols-[1.3fr_1fr] items-end gap-1.5 sm:flex sm:flex-nowrap sm:gap-2">
        <div className="min-w-0 sm:flex-1 sm:max-w-[260px]">
          <DateField label="From" value={changeDate} dimFutureDates={false} onChange={setChangeDate} />
        </div>
        <div className="min-w-0 sm:flex-none sm:shrink-0">
          <AmountCaption value={cadence} onChange={setCadence} />
          <AmountInput
            className="w-full sm:w-[150px]"
            label={`Amount ${CADENCE_SUFFIX[cadence]} from this date`}
            value={changeAmount}
            onChange={setChangeAmount}
            onEnter={saveChange}
          />
        </div>
        <EndDateField value={changeEnd} from={changeDate} onChange={setChangeEnd} />
      </div>
      {paydayNote ? <p className="mt-1 text-caption text-text-tertiary">{paydayNote}</p> : null}
      <FormActions saveLabel="Save change" saveDisabled={!changeAmount.trim()} onSave={saveChange} />
        </>
      )}

      {/* One row. The name field is what is read here, so it takes the space
          the two buttons do not need — and what was actually wrong with these
          buttons was never their width, it was that they looked identical.
          Stopping keeps every month the line ran; deleting takes them, so only
          deleting is red, at rest rather than on a hover a phone cannot do. */}
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/60 pt-2.5">
        <input
          className="focus-ring min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-label text-text-primary sm:max-w-[320px]"
          value={label}
          aria-label="Line name"
          onChange={(event) => setLabel(event.target.value)}
          onBlur={commitLabel}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        {latest ? (
          <IconButton
            label={stopped ? `Let ${line.label} run again` : `Stop ${line.label} from a date`}
            onClick={stopped ? resumeLine : stopLine}
          >
            {stopped ? <RotateCcw size={16} strokeWidth={1.8} /> : <CircleSlash size={16} strokeWidth={1.8} />}
          </IconButton>
        ) : null}
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
    effectiveTo: string | null;
  }) => void;
  onRename: (lineId: string, label: string) => void;
  onSetRate: (
    lineId: string,
    effectiveFrom: string,
    amount: number,
    cadence: PayCadence,
    effectiveTo: string | null
  ) => void;
  onUpdateRate: (
    rateId: string,
    effectiveFrom: string,
    amount: number,
    cadence: PayCadence,
    effectiveTo: string | null
  ) => void;
  onDeleteRate: (rateId: string) => void;
  onDeleteLine: (line: FinanceLine) => void;
}) {
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const [addingBucket, setAddingBucket] = useState<FinanceBucket | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newFrom, setNewFrom] = useState(todayInputValue());
  const [newUntil, setNewUntil] = useState<string | null>(null);
  const [newCadence, setNewCadence] = useState<PayCadence>("Monthly");

  function startAdding(bucket: FinanceBucket) {
    setAddingBucket(bucket);
    setOpenLineId(null);
    setNewLabel("");
    setNewAmount("");
    setNewFrom(todayInputValue());
    setNewUntil(null);
    setNewCadence("Monthly");
  }

  function submitNew(bucket: FinanceBucket) {
    const label = newLabel.trim();
    if (!label) return;
    onAddLine({
      bucket,
      label,
      amount: parseAmount(newAmount),
      cadence: newCadence,
      effectiveFrom: newFrom,
      effectiveTo: newUntil
    });
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
              <h2 className="min-w-0 flex-1 truncate text-label font-semibold tracking-[-0.01em] text-text-primary sm:text-subhead">
                {style.title}
              </h2>
              <span className="shrink-0 text-label font-medium tabular-nums text-text-primary">
                {formatCurrency(inEffect)}
              </span>
              {/* 44px, like every other control in the panel — but with the
                  overflow pulled back off the layout box, so the tap target
                  grows and the strip does not. */}
              <button
                className="focus-ring -my-1.5 -mr-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-text-secondary transition-colors duration-200 ease-out hover:bg-surface hover:text-text-primary"
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
                {/* Only the name spans the row — it is the one field that can be
                    long. The date and the amount pair up like everywhere else. */}
                <div className="grid grid-cols-[1.3fr_1fr] items-end gap-1.5 sm:flex sm:flex-nowrap sm:gap-2">
                  <input
                    className="focus-ring col-span-2 min-h-11 min-w-0 rounded-xl border border-border bg-surface px-3 text-label text-text-primary placeholder:text-text-tertiary sm:col-span-1 sm:flex-1"
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
                  <div className="min-w-0 sm:w-[210px]">
                    <DateField label="Starting from" value={newFrom} dimFutureDates={false} onChange={setNewFrom} />
                  </div>
                  <div className="min-w-0 sm:flex-none sm:shrink-0">
                    <AmountCaption value={newCadence} onChange={setNewCadence} />
                    <AmountInput
                      className="w-full sm:w-[150px]"
                      label={`New line amount ${CADENCE_SUFFIX[newCadence]}`}
                      value={newAmount}
                      onChange={setNewAmount}
                      onEnter={() => submitNew(bucket)}
                    />
                  </div>
                  {/* A charge that is known to end — a twelve-month plan, a
                      sublet — can say so as it is typed, instead of coming back
                      later to stop it. */}
                  <EndDateField value={newUntil} from={newFrom} onChange={setNewUntil} />
                </div>
                <FormActions
                  saveLabel="Add line"
                  saveDisabled={!newLabel.trim()}
                  onSave={() => submitNew(bucket)}
                  onCancel={() => setAddingBucket(null)}
                />
              </div>
            ) : null}

            {/* An empty bucket is its strip and nothing else. A "Nothing here
                yet" row per bucket cost 176px on a phone to say what the $0.00
                and the + in the strip above it already say. */}

            <div className="divide-y divide-border/60">
              {bucketLines.map((line) => {
                const open = openLineId === line.id;
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
                      {/* The name and the figure, and nothing else. This row
                          also carried "Since Aug 20 · 2 changes" — which is the
                          history list, restated above itself, on every line of a
                          list that is read to find a name. Everything it said is
                          in the expansion already: the schedule line names the
                          rhythm and the dated rows name every change. Dropping
                          it also hands its 220px column back to the label, which
                          was truncating "OR Statewide Transit Tax (Ivan)". */}
                      <span className="min-w-0 flex-1 truncate text-body text-text-secondary sm:text-label">
                        {line.label}
                      </span>
                      <span className="shrink-0 text-right text-body tabular-nums text-text-primary sm:w-[120px] sm:text-label">
                        {/* A line with no rate yet is not worth $0.00 — that is a
                            zero pretending to be a figure, which is what the
                            "No amount set" in the old subtitle was guarding. */}
                        {line.rates.length === 0 ? (
                          <span className="text-text-tertiary">—</span>
                        ) : (
                          <>
                            {formatCurrency(currentAmount(line.rates))}
                            <AverageTag cadence={currentCadence(line.rates)} />
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
                      <LineDetail
                        line={line}
                        onRename={(label) => onRename(line.id, label)}
                        onSetRate={(effectiveFrom, amount, cadence, effectiveTo) =>
                          onSetRate(line.id, effectiveFrom, amount, cadence, effectiveTo)
                        }
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

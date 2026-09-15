"use client";

import { useState } from "react";
import { CircleSlash, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { DateField } from "@/components/ui/DateField";
import { CadencePicker } from "@/components/finances/CadencePicker";
import {
  ActionButton,
  AmountInput,
  BlockHeader,
  BucketPicker,
  FormHeader,
  IconButton,
  NameInput,
  parseAmount
} from "@/components/finances/manage/controls";
import {
  CADENCE_SUFFIX,
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
 * A figure that is the same every month until somebody changes it.
 *
 * Rent, a paycheck, a subscription, a loan. What makes it `fixed` is not that
 * the number never moves — it is that a move is an **event**, with a date, worth
 * recording. So the editor leads with what it is worth right now and keeps the
 * dated history under it, instead of leading with a form.
 *
 * The old Setup panel had this the other way round: a line opened onto its
 * history list with an entry form permanently under it, and what the line
 * actually costs today was only ever readable off the collapsed row you had just
 * tapped away from. Nine visits in ten are to read that figure or to correct the
 * last change, and neither wanted a blank form sitting open.
 */

function longDate(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    parseLocalDate(dateValue)
  );
}

/** The rate in force today: the newest one that has started and not yet ended. */
function rateInForce(rates: FinanceRate[]) {
  const today = todayInputValue();
  return (
    [...rates]
      .reverse()
      .find((rate) => rate.effective_from <= today && (rate.effective_to === null || rate.effective_to >= today)) ?? null
  );
}

/** A change being typed or corrected — the four things one holds. */
type RateDraft = { id: string | null; date: string; amount: string; cadence: PayCadence; end: string | null };

/**
 * The one form both writing a change and correcting one use.
 *
 * Two separate forms on a card — one adding, one editing — is how a raise gets
 * typed into the wrong one, which the old panel caught the hard way and then
 * guarded by hiding one whenever the other was open. One form cannot have that
 * problem.
 *
 * Its buttons are above its fields: see `FormHeader`.
 */
function RateForm({
  draft,
  payday,
  onChange,
  onSave,
  onCancel,
  onDelete
}: {
  draft: RateDraft;
  payday: number | null;
  onChange: (next: RateDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const typed = parseAmount(draft.amount);
  const monthly = monthlyFromCadence(typed, draft.cadence);

  return (
    <div className="border-t border-border/60 bg-accent-soft/30 px-3.5 py-3 sm:px-4">
      <FormHeader
        title={draft.id ? "Correct this change" : "New amount"}
        saveLabel="Save"
        saveDisabled={!draft.amount.trim()}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={onDelete}
      />

      {/* A date and an amount both fit a phone row; giving each its own line
          wasted half a row twice over. Only the end date, which is optional and
          arrives last, takes a line of its own. */}
      <div className="grid grid-cols-[1.3fr_1fr] items-end gap-1.5 sm:flex sm:flex-nowrap sm:gap-2">
        <div className="min-w-0 sm:flex-1 sm:max-w-[260px]">
          <DateField
            label="From"
            value={draft.date}
            dimFutureDates={false}
            onChange={(date) => onChange({ ...draft, date })}
          />
        </div>
        <div className="min-w-0 sm:flex-none sm:shrink-0">
          {/* The caption says what the number is, then how often it arrives. The
              cadence alone left a field between FROM and UNTIL labelled
              "2 WEEKS", which says when and never says what. */}
          <span className="flex min-h-[19px] items-center gap-1">
            <span className="text-meta font-medium uppercase tracking-[0.04em] text-text-tertiary">Amount</span>
            <span aria-hidden className="text-meta text-text-tertiary/60">
              ·
            </span>
            <CadencePicker value={draft.cadence} onChange={(cadence) => onChange({ ...draft, cadence })} />
          </span>
          <AmountInput
            className="sm:w-[150px]"
            label={`Amount ${CADENCE_SUFFIX[draft.cadence]} from this date`}
            value={draft.amount}
            onChange={(amount) => onChange({ ...draft, amount })}
            onEnter={onSave}
          />
        </div>
        {draft.end === null ? null : (
          <div className="col-span-2 min-w-0 sm:flex-1 sm:max-w-[230px]">
            <DateField
              label="Until"
              value={draft.end}
              dimFutureDates={false}
              onChange={(end) => onChange({ ...draft, end })}
              action={
                <button
                  className="focus-ring-child group -my-3 -mr-2 px-2 py-3"
                  type="button"
                  aria-label="Remove the end date"
                  onClick={() => onChange({ ...draft, end: null })}
                >
                  <span className="block rounded-md px-1 py-0.5 text-meta font-medium text-text-tertiary transition-colors duration-200 ease-out group-hover:bg-surface group-hover:text-text-secondary">
                    Remove
                  </span>
                </button>
              }
            />
          </div>
        )}
      </div>

      {/* Two sentences at most, and each one says something the fields cannot:
          that the date typed is about to be moved onto the payday, and what a
          non-monthly figure comes to a month. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {draft.end === null ? (
          <button
            className="focus-ring flex min-h-11 items-center gap-1 rounded-xl px-2 text-list text-text-tertiary transition-colors duration-200 ease-out hover:bg-surface hover:text-text-secondary"
            type="button"
            onClick={() => onChange({ ...draft, end: draft.date > todayInputValue() ? draft.date : todayInputValue() })}
          >
            <Plus size={14} strokeWidth={2} />
            Add an end date
          </button>
        ) : null}
        <span className="text-caption text-text-tertiary">
          {payday === null ? null : "Saved as that week's Thursday. "}
          {draft.cadence === "Monthly" || typed === 0 ? null : `${formatCurrency(monthly)} a month on average.`}
        </span>
      </div>
    </div>
  );
}

export function FixedEditor({
  line,
  onRename,
  onMove,
  onSetRate,
  onUpdateRate,
  onDeleteRate,
  onDelete
}: {
  line: FinanceLine;
  onRename: (label: string) => void;
  onMove: (bucket: FinanceBucket) => void;
  onSetRate: (effectiveFrom: string, amount: number, cadence: PayCadence, effectiveTo: string | null) => void;
  onUpdateRate: (
    rateId: string,
    effectiveFrom: string,
    amount: number,
    cadence: PayCadence,
    effectiveTo: string | null
  ) => void;
  onDeleteRate: (rateId: string) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(line.label);
  const [draft, setDraft] = useState<RateDraft | null>(null);

  const payday = paydayWeekdayFor(line.label);
  const inForce = rateInForce(line.rates);
  const latest = line.rates[line.rates.length - 1] ?? null;
  const stopped = endedOn(line.rates);
  const schedule = scheduleSummary(line);

  function startNew() {
    setDraft({
      id: null,
      date: todayInputValue(),
      amount: "",
      // A line paid every second week is still paid every second week after a
      // raise, so a new change inherits the cadence already in force.
      cadence: currentCadence(line.rates),
      end: null
    });
  }

  function startEditing(rate: FinanceRate, end: string | null = rate.effective_to ?? null) {
    setDraft({
      id: rate.id,
      date: rate.effective_from,
      amount: String(rate.entered_amount),
      cadence: rate.cadence,
      end
    });
  }

  function save() {
    if (!draft || !draft.amount.trim()) return;
    const date = snapToPayday(draft.date, payday);
    const amount = parseAmount(draft.amount);
    if (draft.id) onUpdateRate(draft.id, date, amount, draft.cadence, draft.end);
    else onSetRate(date, amount, draft.cadence, draft.end);
    setDraft(null);
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
    <div className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      {/* What it is, and where on the month it lands. Both are set once and read
          every visit, so they sit above the figure rather than behind a pencil. */}
      <div className="flex flex-col gap-1.5 px-3.5 py-3 sm:flex-row sm:items-center sm:px-4">
        <NameInput
          className="sm:max-w-[320px]"
          value={label}
          label="Name"
          onChange={setLabel}
          onCommit={commitLabel}
        />
        <BucketPicker value={line.bucket} onChange={onMove} className="sm:ml-auto" />
      </div>

      {/* The answer the editor is opened for, before any form. */}
      <div className="border-t border-border/60 bg-subtle/40 px-3.5 py-3 sm:px-4">
        {inForce ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-figure-lg font-semibold tabular-nums leading-none text-text-primary">
                {formatCurrency(inForce.entered_amount)}
              </span>
              <span className="text-body text-text-secondary">{CADENCE_SUFFIX[inForce.cadence]}</span>
            </div>
            <p className="mt-1 text-caption text-text-tertiary">
              Since {longDate(inForce.effective_from)}
              {inForce.cadence === "Monthly"
                ? ""
                : ` · ${formatCurrency(inForce.monthly_amount)} a month on average`}
            </p>
          </>
        ) : (
          <p className="text-body text-text-tertiary">
            {/* Never $0.00: a line with no rate is not worth nothing, it is
                unanswered, and a zero here would be added into the month. */}
            {stopped ? "Stopped. Nothing is counted after its end date." : "No amount set yet."}
          </p>
        )}

        {/* The rhythm the app worked out from the date on the earliest change.
            It is inferred, so it is printed — that date silently fixes which day
            of the cycle every payment lands on, and nothing used to say so. */}
        {schedule ? <p className="mt-0.5 text-caption text-text-tertiary">{schedule}</p> : null}

        {draft ? null : (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <ActionButton tone="primary" onClick={startNew}>
              <Plus size={16} strokeWidth={2} />
              {line.rates.length === 0 ? "Set the amount" : "Change the amount"}
            </ActionButton>
            {latest ? (
              <ActionButton
                tone="quiet"
                onClick={() => {
                  if (stopped) {
                    // Resuming clears the end date outright — there is nothing
                    // to choose about it.
                    onUpdateRate(latest.id, latest.effective_from, Number(latest.entered_amount), latest.cadence, null);
                  } else {
                    // Stopping opens the last change with an end date suggested,
                    // so the date is confirmed rather than silently written.
                    startEditing(
                      latest,
                      latest.effective_from > todayInputValue() ? latest.effective_from : todayInputValue()
                    );
                  }
                }}
              >
                {stopped ? <RotateCcw size={15} strokeWidth={1.8} /> : <CircleSlash size={15} strokeWidth={1.8} />}
                {stopped ? "Let it run again" : "Stop it"}
              </ActionButton>
            ) : null}
          </div>
        )}
      </div>

      {draft ? (
        <RateForm
          draft={draft}
          payday={payday}
          onChange={setDraft}
          onSave={save}
          onCancel={() => setDraft(null)}
          onDelete={
            draft.id
              ? () => {
                  const id = draft.id as string;
                  setDraft(null);
                  onDeleteRate(id);
                }
              : undefined
          }
        />
      ) : null}

      {line.rates.length > 0 ? (
        <>
          <BlockHeader title={line.rates.length === 1 ? "1 change" : `${line.rates.length} changes`} />
          <div className="divide-y divide-border/60">
            {/* Newest first: the change most likely being corrected is the last
                one made. Each row is the way into editing it — a trash icon on
                every row is one mis-tap from losing a figure typed months ago,
                so deleting is a step inside the open form. */}
            {[...line.rates].reverse().map((rate) => (
              <button
                key={rate.id}
                className={cn(
                  "focus-ring flex min-h-11 w-full items-center gap-2 px-3.5 py-2 text-left transition-colors duration-200 ease-out hover:bg-subtle/60 sm:px-4",
                  draft?.id === rate.id && "bg-accent-soft/40"
                )}
                type="button"
                aria-label={`Edit the change from ${longDate(rate.effective_from)}`}
                onClick={() => startEditing(rate)}
              >
                <span className="min-w-0 flex-1 text-list text-text-secondary">
                  <span className="block truncate">
                    From {longDate(rate.effective_from)}
                    {rate.effective_to ? ` → ${longDate(rate.effective_to)}` : ""}
                    {rate.effective_from > todayInputValue() ? (
                      <span className="ml-1.5 rounded-md bg-accent-soft px-1.5 py-0.5 text-micro font-medium text-text-secondary">
                        Upcoming
                      </span>
                    ) : null}
                  </span>
                  {rate.cadence === "Monthly" ? null : (
                    <span className="block truncate text-caption text-text-tertiary sm:hidden">
                      {formatCurrency(rate.entered_amount)} {CADENCE_SUFFIX[rate.cadence]}
                    </span>
                  )}
                </span>
                <span className="hidden shrink-0 text-right text-meta tabular-nums text-text-tertiary sm:block sm:w-[180px]">
                  {rate.cadence === "Monthly"
                    ? ""
                    : `${formatCurrency(rate.entered_amount)} ${CADENCE_SUFFIX[rate.cadence]}`}
                </span>
                <span className="shrink-0 text-right text-list font-medium tabular-nums text-text-primary sm:w-[110px]">
                  {formatCurrency(rate.monthly_amount)}
                  {rate.cadence === "Monthly" ? null : (
                    <span className="ml-1 text-micro font-normal text-text-tertiary">avg</span>
                  )}
                </span>
                <Pencil size={13} strokeWidth={1.7} className="shrink-0 text-text-tertiary" />
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* The one write here that destroys history, on its own row at the foot,
          red at rest because a phone has no hover to turn it red on. */}
      <div className="flex items-center justify-end border-t border-border/60 px-3.5 py-2.5 sm:px-4">
        <IconButton label={`Delete ${line.label}`} tone="danger" onClick={onDelete}>
          <Trash2 size={16} strokeWidth={1.8} />
        </IconButton>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Check, Plus, Repeat, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { DateField } from "@/components/ui/DateField";
import { CadencePicker } from "@/components/finances/CadencePicker";
import { AmountInput, BlockHeader, FormHeader, NameInput, parseAmount } from "@/components/finances/manage/controls";
import { CADENCE_SUFFIX, EDITABLE_BUCKETS, SECTION_STYLE, monthlyFromCadence, snapToPayday, paydayWeekdayFor } from "@/lib/finances";
import { formatCurrency, todayInputValue } from "@/lib/formatters";
import { UTILITY_BUCKETS } from "@/types/utility";
import type { EntryKind } from "@/lib/financeEntries";
import type { FinanceBucket, PayCadence } from "@/types/finance";

/**
 * Adding anything — one form, one place.
 *
 * Before this, what you were adding decided which of two panels you had to be
 * in first, and inside the panel it decided which bucket's `+` you had to find:
 * you had to classify the thing correctly before the app would let you type its
 * name. Rent went in under Setup → Needs → `+`; the water bill went in under
 * Utilities → `+` and was silently a different kind of record.
 *
 * Here the name comes first and the classification follows, as two plain
 * questions. The second of them replaces the old Setup/Utilities split with
 * something a person can actually answer without knowing how the app stores
 * anything: **is the amount the same every month, or does it move?**
 */

const KINDS: { kind: EntryKind; title: string; blurb: string; icon: typeof Repeat }[] = [
  {
    kind: "fixed",
    title: "The same every month",
    blurb: "Rent, a paycheck, a subscription. You type it once and change it when it changes.",
    icon: Repeat
  },
  {
    kind: "varies",
    title: "Different every month",
    blurb: "Water, power, gas. You type each month's bill as it arrives, and it keeps the history.",
    icon: TrendingUp
  }
];

export function AddEntryForm({
  onCancel,
  onAddFixed,
  onAddVaries
}: {
  onCancel: () => void;
  onAddFixed: (input: {
    bucket: FinanceBucket;
    label: string;
    amount: number;
    cadence: PayCadence;
    effectiveFrom: string;
    effectiveTo: string | null;
  }) => void;
  onAddVaries: (input: { name: string; bucket: FinanceBucket }) => void;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<EntryKind>("fixed");
  const [bucket, setBucket] = useState<FinanceBucket>("Needs");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<PayCadence>("Monthly");
  const [from, setFrom] = useState(todayInputValue());
  const [until, setUntil] = useState<string | null>(null);

  // A metered bill is never gross income, so the choice narrows with the kind —
  // and a bucket already picked that the new kind cannot hold moves back to the
  // default rather than being submitted as something the table will reject.
  const buckets: FinanceBucket[] = kind === "varies" ? (UTILITY_BUCKETS as FinanceBucket[]) : EDITABLE_BUCKETS;
  const chosen = buckets.includes(bucket) ? bucket : "Needs";

  const typed = parseAmount(amount);
  const ready = label.trim().length > 0;

  function submit() {
    const name = label.trim();
    if (!name) return;
    if (kind === "varies") {
      onAddVaries({ name, bucket: chosen });
      return;
    }
    onAddFixed({
      bucket: chosen,
      label: name,
      amount: typed,
      cadence,
      effectiveFrom: snapToPayday(from, paydayWeekdayFor(name)),
      effectiveTo: until
    });
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      <div className="px-3.5 py-3 sm:px-4">
        <FormHeader title="Add" saveLabel="Add it" saveDisabled={!ready} onSave={submit} onCancel={onCancel} />
        <NameInput
          value={label}
          label="What is it?"
          placeholder="Rent, Spotify, Water…"
          autoFocus
          onChange={setLabel}
        />
      </div>

      {/* The question that replaces "which of the two panels was this in". Two
          cards rather than a toggle, because each needs a line of explanation
          the first time and nothing afterwards. */}
      <BlockHeader title="Is the amount the same every month?" />
      <div className="grid gap-1.5 px-3.5 py-3 sm:grid-cols-2 sm:px-4">
        {KINDS.map((option) => {
          const Icon = option.icon;
          const active = kind === option.kind;
          return (
            <button
              key={option.kind}
              className={cn(
                "focus-ring rounded-xl border px-3 py-2.5 text-left transition-colors duration-200 ease-out",
                active
                  ? "border-accent bg-accent-soft"
                  : "border-border/60 bg-surface hover:border-border hover:bg-subtle/60"
              )}
              type="button"
              aria-pressed={active}
              onClick={() => setKind(option.kind)}
            >
              <span className="flex items-center gap-2">
                <Icon size={16} strokeWidth={1.8} className="shrink-0 text-text-secondary" />
                <span className="min-w-0 flex-1 truncate text-label font-medium text-text-primary">
                  {option.title}
                </span>
                {active ? <Check size={15} strokeWidth={2} className="shrink-0 text-text-secondary" /> : null}
              </span>
              <span className="mt-1 block text-caption leading-snug text-text-tertiary">{option.blurb}</span>
            </button>
          );
        })}
      </div>

      {/* Every option shown, with its colour, because this is picked once and the
          colour is how the line is found on the month afterwards. */}
      <BlockHeader title="Which part of the month" />
      <div className="flex flex-wrap gap-1.5 px-3.5 py-3 sm:px-4">
        {buckets.map((option) => {
          const active = chosen === option;
          return (
            <button
              key={option}
              className={cn(
                "focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-label transition-colors duration-200 ease-out",
                active
                  ? "border-accent bg-accent-soft text-text-primary"
                  : "border-border/60 bg-surface text-text-secondary hover:bg-subtle"
              )}
              type="button"
              aria-pressed={active}
              onClick={() => setBucket(option)}
            >
              <span aria-hidden className={cn("h-3.5 w-1.5 shrink-0 rounded-full", SECTION_STYLE[option].color)} />
              {SECTION_STYLE[option].title}
            </button>
          );
        })}
      </div>

      {/* Only a fixed figure has an amount to type now. A metered account is
          worth nothing until its first bill, and a zero typed here would be a
          guess added into the month. */}
      {kind === "fixed" ? (
        <>
          <BlockHeader title="What it costs" />
          <div className="px-3.5 py-3 sm:px-4">
            <div className="grid grid-cols-[1.3fr_1fr] items-end gap-1.5 sm:flex sm:flex-nowrap sm:gap-2">
              <div className="min-w-0 sm:flex-1 sm:max-w-[260px]">
                <DateField label="Starting from" value={from} dimFutureDates={false} onChange={setFrom} />
              </div>
              <div className="min-w-0 sm:flex-none sm:shrink-0">
                <span className="flex min-h-[19px] items-center gap-1">
                  <span className="text-meta font-medium uppercase tracking-[0.04em] text-text-tertiary">Amount</span>
                  <span aria-hidden className="text-meta text-text-tertiary/60">
                    ·
                  </span>
                  <CadencePicker value={cadence} onChange={setCadence} />
                </span>
                <AmountInput
                  className="sm:w-[150px]"
                  label={`Amount ${CADENCE_SUFFIX[cadence]}`}
                  value={amount}
                  onChange={setAmount}
                  onEnter={submit}
                />
              </div>
              {until === null ? null : (
                <div className="col-span-2 min-w-0 sm:flex-1 sm:max-w-[230px]">
                  <DateField
                    label="Until"
                    value={until}
                    dimFutureDates={false}
                    onChange={setUntil}
                    action={
                      <button
                        className="focus-ring-child group -my-3 -mr-2 px-2 py-3"
                        type="button"
                        aria-label="Remove the end date"
                        onClick={() => setUntil(null)}
                      >
                        <span className="block rounded-md px-1 py-0.5 text-meta font-medium text-text-tertiary transition-colors duration-200 ease-out group-hover:bg-subtle group-hover:text-text-secondary">
                          Remove
                        </span>
                      </button>
                    }
                  />
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {until === null ? (
                <button
                  className="focus-ring flex min-h-11 items-center gap-1 rounded-xl px-2 text-list text-text-tertiary transition-colors duration-200 ease-out hover:bg-subtle hover:text-text-secondary"
                  type="button"
                  onClick={() => setUntil(from > todayInputValue() ? from : todayInputValue())}
                >
                  <Plus size={14} strokeWidth={2} />
                  Add an end date
                </button>
              ) : null}
              {cadence === "Monthly" || typed === 0 ? null : (
                <span className="text-caption text-text-tertiary">
                  {formatCurrency(monthlyFromCadence(typed, cadence))} a month on average.
                </span>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

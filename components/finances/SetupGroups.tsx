"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { DateField } from "@/components/ui/DateField";
import { EDITABLE_BUCKETS, SECTION_STYLE, currentAmount } from "@/lib/finances";
import { formatCurrency, formatShortDate, parseLocalDate, todayInputValue } from "@/lib/formatters";
import type { FinanceBucket, FinanceLine } from "@/types/finance";

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
  onDeleteRate,
  onDeleteLine
}: {
  line: FinanceLine;
  onRename: (label: string) => void;
  onSetRate: (effectiveFrom: string, amount: number) => void;
  onDeleteRate: (rateId: string) => void;
  onDeleteLine: () => void;
}) {
  const [label, setLabel] = useState(line.label);
  const [changeDate, setChangeDate] = useState(todayInputValue());
  const [changeAmount, setChangeAmount] = useState("");

  function saveChange() {
    if (!changeAmount.trim()) return;
    onSetRate(changeDate, parseAmount(changeAmount));
    setChangeAmount("");
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
    <div className="bg-subtle/50 px-3.5 py-2.5">
      {line.rates.length > 0 ? (
        <div className="mb-2.5 divide-y divide-border/50">
          {/* Newest first: the change most likely being corrected is the last one
              made. */}
          {[...line.rates].reverse().map((rate) => (
            <div key={rate.id} className="flex items-center gap-2 py-0.5">
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-secondary">
                From {longDate(rate.effective_from)}
              </span>
              <span className="shrink-0 text-[13px] font-medium tabular-nums text-text-primary">
                {formatCurrency(rate.monthly_amount)}
              </span>
              <button
                className="focus-ring grid h-8 w-7 shrink-0 place-items-center rounded-lg text-text-tertiary transition-colors duration-200 ease-out hover:bg-danger-soft hover:text-danger"
                type="button"
                aria-label={`Remove the change from ${longDate(rate.effective_from)}`}
                onClick={() => onDeleteRate(rate.id)}
              >
                <Trash2 size={14} strokeWidth={1.7} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Date, amount, save — one row. The date field is flexible and the amount
          fixed and narrow, which is what keeps the date on a single line at
          390px; it wrapped when both were fighting for the same width. */}
      <div className="flex items-end gap-1.5">
        <div className="min-w-0 flex-1">
          <DateField label="From" value={changeDate} dimFutureDates={false} onChange={setChangeDate} />
        </div>
        <div className="shrink-0">
          <span className="mb-2 block text-[12px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
            A month
          </span>
          <AmountInput
            className="w-[96px]"
            label="Monthly amount from this date"
            value={changeAmount}
            onChange={setChangeAmount}
            onEnter={saveChange}
          />
        </div>
        <IconButton label="Save this change" tone="accent" disabled={!changeAmount.trim()} onClick={saveChange}>
          <Check size={17} strokeWidth={2} />
        </IconButton>
      </div>
      <p className="mt-1.5 text-[11px] text-text-tertiary">
        A month the date lands inside is split across both amounts. To stop a line, change it to 0.
      </p>

      <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/60 pt-2.5">
        <input
          className="focus-ring min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-[15px] text-text-primary"
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
  onDeleteRate,
  onDeleteLine
}: {
  lines: FinanceLine[];
  onAddLine: (input: { bucket: FinanceBucket; label: string; amount: number; effectiveFrom: string }) => void;
  onRename: (lineId: string, label: string) => void;
  onSetRate: (lineId: string, effectiveFrom: string, amount: number) => void;
  onDeleteRate: (rateId: string) => void;
  onDeleteLine: (line: FinanceLine) => void;
}) {
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const [addingBucket, setAddingBucket] = useState<FinanceBucket | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newFrom, setNewFrom] = useState(todayInputValue());

  function startAdding(bucket: FinanceBucket) {
    setAddingBucket(bucket);
    setOpenLineId(null);
    setNewLabel("");
    setNewAmount("");
    setNewFrom(todayInputValue());
  }

  function submitNew(bucket: FinanceBucket) {
    const label = newLabel.trim();
    if (!label) return;
    onAddLine({ bucket, label, amount: parseAmount(newAmount), effectiveFrom: newFrom });
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
            {/* A 32px strip, not a card header. */}
            <div className="flex items-center gap-2 bg-[#FAFAF7] px-3.5 py-1.5">
              <span aria-hidden className={cn("h-3 w-1 shrink-0 rounded-full", style.color)} />
              <h2 className="min-w-0 flex-1 truncate text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
                {style.title}
              </h2>
              <span className="shrink-0 text-[12px] font-medium tabular-nums text-text-secondary">
                {formatCurrency(inEffect)}
              </span>
              <button
                className="focus-ring -mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-tertiary transition-colors duration-200 ease-out hover:bg-subtle hover:text-text-primary"
                type="button"
                aria-label={`Add a line to ${style.title}`}
                onClick={() => (addingBucket === bucket ? setAddingBucket(null) : startAdding(bucket))}
              >
                <Plus size={16} strokeWidth={2} />
              </button>
            </div>

            {addingBucket === bucket ? (
              <div className="border-t border-border/60 bg-accent-soft/30 px-3.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  <input
                    className="focus-ring min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-[15px] text-text-primary placeholder:text-text-tertiary"
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
                  <AmountInput
                    className="w-[96px] shrink-0"
                    label="New line monthly amount"
                    value={newAmount}
                    onChange={setNewAmount}
                    onEnter={() => submitNew(bucket)}
                  />
                </div>
                <div className="mt-2 flex items-end gap-1.5">
                  <div className="min-w-0 flex-1">
                    <DateField label="Starting from" value={newFrom} dimFutureDates={false} onChange={setNewFrom} />
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

                return (
                  <div key={line.id}>
                    <button
                      className="focus-ring flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors duration-200 ease-out hover:bg-subtle/60"
                      type="button"
                      aria-expanded={open}
                      onClick={() => {
                        setOpenLineId(open ? null : line.id);
                        setAddingBucket(null);
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-text-primary">{line.label}</span>
                        <span className="block truncate text-[11px] text-text-tertiary">
                          {line.rates.length === 0
                            ? "No amount set"
                            : pending
                              ? `→ ${formatCurrency(latest.monthly_amount)} on ${formatShortDate(
                                  latest.effective_from
                                )}`
                              : `Since ${formatShortDate(latest.effective_from)}${
                                  line.rates.length > 1 ? ` · ${line.rates.length} changes` : ""
                                }`}
                        </span>
                      </span>
                      <span className="shrink-0 text-[14.5px] font-medium tabular-nums text-text-primary">
                        {formatCurrency(currentAmount(line.rates))}
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
                        onSetRate={(effectiveFrom, amount) => onSetRate(line.id, effectiveFrom, amount)}
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

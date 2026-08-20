"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { DateField } from "@/components/ui/DateField";
import { currentAmount } from "@/lib/finances";
import { formatCurrency, formatShortDate, parseLocalDate, todayInputValue } from "@/lib/formatters";
import type { FinanceBucket, FinanceLine } from "@/types/finance";

/**
 * One bucket's standing figures, and the dated history behind each of them.
 *
 * A line reads as its current amount, because that is what you come here to
 * check. Opening it shows every change it has ever had and lets you add another
 * — which is the whole point of this screen: a figure changes *from a date*, and
 * the months before that date keep what they had.
 *
 * One line open at a time. The expanded state is tall by nature, and two of them
 * side by side turns a setup screen into a scroll.
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
        "focus-ring min-h-11 w-[120px] shrink-0 rounded-xl border border-border bg-subtle px-3 text-right text-[15px] tabular-nums text-text-primary placeholder:text-text-tertiary",
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
    <div className="border-t border-border/70 bg-subtle/40 px-3.5 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">History</div>
      <div className="mt-1.5 divide-y divide-border/60">
        {line.rates.length === 0 ? (
          <div className="py-2 text-[13px] text-text-tertiary">No amount set yet.</div>
        ) : (
          // Newest first: the change you are most likely to be correcting is the
          // one you just made.
          [...line.rates].reverse().map((rate) => (
            <div key={rate.id} className="flex min-h-11 items-center gap-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-secondary">
                From {longDate(rate.effective_from)}
              </span>
              <span className="shrink-0 text-[14px] font-medium tabular-nums text-text-primary">
                {formatCurrency(rate.monthly_amount)}
              </span>
              <button
                className="focus-ring grid h-9 w-8 shrink-0 place-items-center rounded-xl text-text-tertiary transition hover:bg-danger-soft hover:text-danger"
                type="button"
                aria-label={`Remove the change from ${longDate(rate.effective_from)}`}
                onClick={() => onDeleteRate(rate.id)}
              >
                <Trash2 size={15} strokeWidth={1.7} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 border-t border-border/70 pt-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
          {line.rates.length === 0 ? "Set the amount" : "Change it from a date"}
        </div>
        {/* Stacked, not side by side. On a phone the date button and a fixed
            amount field in one row squeezed the date onto two lines and left the
            save control hanging off the bottom of it. */}
        <div className="mt-1.5 space-y-2">
          {/* Never a bare date input — that renders the browser's picker
              instead of the app's. */}
          <DateField label="From" value={changeDate} dimFutureDates={false} onChange={setChangeDate} />
          <div className="flex items-center gap-2">
            <AmountInput
              className="w-auto min-w-0 flex-1 shrink"
              label="Monthly amount from this date"
              value={changeAmount}
              onChange={setChangeAmount}
              onEnter={saveChange}
            />
            <button
              className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-text-primary transition hover:bg-accent disabled:opacity-40"
              type="button"
              aria-label="Save this change"
              disabled={!changeAmount.trim()}
              onClick={saveChange}
            >
              <Check size={17} strokeWidth={2} />
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-text-tertiary">
          Applies from this date on. A month the date falls inside is split across both amounts. Ending a line is a
          change to 0.
        </p>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border/70 pt-3">
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
        <button
          className="focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[14px] font-medium text-danger transition hover:bg-danger-soft"
          type="button"
          onClick={onDeleteLine}
        >
          <Trash2 size={15} strokeWidth={1.8} />
          Delete
        </button>
      </div>
    </div>
  );
}

export function SetupBucketCard({
  bucket,
  title,
  blurb,
  lines,
  onAddLine,
  onRename,
  onSetRate,
  onDeleteRate,
  onDeleteLine
}: {
  bucket: FinanceBucket;
  title: string;
  blurb: string;
  lines: FinanceLine[];
  onAddLine: (input: { bucket: FinanceBucket; label: string; amount: number; effectiveFrom: string }) => void;
  onRename: (lineId: string, label: string) => void;
  onSetRate: (lineId: string, effectiveFrom: string, amount: number) => void;
  onDeleteRate: (rateId: string) => void;
  onDeleteLine: (line: FinanceLine) => void;
}) {
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newFrom, setNewFrom] = useState(todayInputValue());

  const inEffect = lines.reduce((total, line) => total + currentAmount(line.rates), 0);

  function submitNew() {
    const label = newLabel.trim();
    if (!label) return;
    onAddLine({ bucket, label, amount: parseAmount(newAmount), effectiveFrom: newFrom });
    setNewLabel("");
    setNewAmount("");
    setNewFrom(todayInputValue());
    setAdding(false);
  }

  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      <div className="flex items-start gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-medium leading-tight text-text-primary">{title}</h2>
          <p className="mt-0.5 text-[12px] text-text-tertiary">{blurb}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[17px] font-medium leading-none tabular-nums text-text-primary">
            {formatCurrency(inEffect)}
          </div>
          <div className="mt-1 text-[11px] text-text-tertiary">a month now</div>
        </div>
      </div>

      <div className="divide-y divide-border/70 border-t border-border/70">
        {lines.length === 0 ? (
          <div className="px-3.5 py-3 text-[13px] text-text-tertiary">Nothing here yet.</div>
        ) : (
          lines.map((line) => {
            const open = openLineId === line.id;
            const latest = line.rates[line.rates.length - 1];
            const pending = latest && latest.effective_from > todayInputValue();

            return (
              <div key={line.id}>
                <button
                  className="focus-ring flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-subtle/60"
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenLineId(open ? null : line.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] text-text-primary">{line.label}</div>
                    <div className="mt-0.5 text-[11.5px] text-text-tertiary">
                      {line.rates.length === 0
                        ? "No amount set"
                        : pending
                          ? `${formatCurrency(currentAmount(line.rates))} → ${formatCurrency(
                              latest.monthly_amount
                            )} on ${formatShortDate(latest.effective_from)}`
                          : `Since ${longDate(latest.effective_from)}${
                              line.rates.length > 1 ? ` · ${line.rates.length} changes` : ""
                            }`}
                    </div>
                  </div>
                  <span className="shrink-0 text-[15px] font-medium tabular-nums text-text-primary">
                    {formatCurrency(currentAmount(line.rates))}
                  </span>
                  <ChevronDown
                    size={16}
                    strokeWidth={1.8}
                    className={cn("shrink-0 text-text-tertiary transition", open && "rotate-180")}
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
          })
        )}
      </div>

      <div className="border-t border-border/70 p-2.5">
        {adding ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                className="focus-ring min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-subtle px-3 text-[15px] text-text-primary placeholder:text-text-tertiary"
                value={newLabel}
                aria-label="New line name"
                placeholder="Name"
                autoFocus
                onChange={(event) => setNewLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitNew();
                  if (event.key === "Escape") setAdding(false);
                }}
              />
              <AmountInput
                className="w-[104px]"
                label="New line monthly amount"
                value={newAmount}
                onChange={setNewAmount}
                onEnter={submitNew}
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <DateField label="Starting from" value={newFrom} dimFutureDates={false} onChange={setNewFrom} />
              </div>
              <button
                className="focus-ring grid h-11 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-text-primary transition hover:bg-accent disabled:opacity-40"
                type="button"
                aria-label="Save new line"
                disabled={!newLabel.trim()}
                onClick={submitNew}
              >
                <Check size={17} strokeWidth={2} />
              </button>
              <button
                className="focus-ring grid h-11 w-10 shrink-0 place-items-center rounded-xl text-text-tertiary transition hover:bg-subtle hover:text-text-secondary"
                type="button"
                aria-label="Cancel new line"
                onClick={() => setAdding(false)}
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
          </div>
        ) : (
          <button
            className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-[14px] font-medium text-text-secondary transition hover:bg-subtle hover:text-text-primary"
            type="button"
            onClick={() => setAdding(true)}
          >
            <Plus size={16} strokeWidth={2} />
            Add line
          </button>
        )}
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Check, Link2, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import { shareOfIncome } from "@/lib/finances";
import type { FinanceBucket, FinanceRow, FinanceSection } from "@/types/finance";

/**
 * One bucket of the month: its rows, its total, and — where the rows are typed
 * in rather than read from the books — the editing for them.
 *
 * Editing happens here rather than in Profile. These are the numbers the page is
 * made of, and a household budget gets adjusted while you are looking at it; a
 * separate settings screen would mean leaving the answer to change the question.
 */

function parseAmount(value: string) {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function SourceBadge({ source }: { source: FinanceRow["source"] }) {
  if (source === "Manual") return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary">
      <Link2 size={10} strokeWidth={2} />
      {source}
    </span>
  );
}

function ReadRow({ row }: { row: FinanceRow }) {
  return (
    <div className="flex min-h-11 items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-[14px]",
              row.informational ? "text-text-tertiary" : "text-text-primary"
            )}
          >
            {row.label}
          </span>
          <SourceBadge source={row.source} />
        </div>
        {row.hint ? <div className="mt-0.5 truncate text-[11.5px] text-text-tertiary">{row.hint}</div> : null}
      </div>
      <div
        className={cn(
          "shrink-0 text-right text-[14px] font-medium tabular-nums",
          row.informational ? "text-text-tertiary" : "text-text-primary"
        )}
      >
        {formatCurrency(row.amount)}
      </div>
    </div>
  );
}

function EditRow({
  row,
  onSave,
  onDelete
}: {
  row: FinanceRow;
  onSave: (patch: { label: string; amount: number }) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(row.label);
  const [amount, setAmount] = useState(row.amount ? String(row.amount) : "");

  // A line edited on another device, or renamed by the other person, should show
  // its new value rather than whatever this input was left holding.
  useEffect(() => {
    setLabel(row.label);
    setAmount(row.amount ? String(row.amount) : "");
  }, [row.label, row.amount]);

  function commit() {
    const nextLabel = label.trim();
    const nextAmount = parseAmount(amount);
    if (!nextLabel) {
      setLabel(row.label);
      return;
    }
    if (nextLabel === row.label && nextAmount === row.amount) return;
    onSave({ label: nextLabel, amount: nextAmount });
  }

  return (
    <div className="flex items-center gap-2 py-1.5">
      <input
        className="focus-ring min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-subtle px-3 text-[15px] text-text-primary placeholder:text-text-tertiary"
        value={label}
        aria-label="Line name"
        placeholder="Name"
        onChange={(event) => setLabel(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <input
        className="focus-ring min-h-11 w-[110px] shrink-0 rounded-xl border border-border bg-subtle px-3 text-right text-[15px] tabular-nums text-text-primary placeholder:text-text-tertiary"
        value={amount}
        aria-label="Monthly amount"
        placeholder="0.00"
        inputMode="decimal"
        onChange={(event) => setAmount(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <button
        className="focus-ring grid h-11 w-9 shrink-0 place-items-center rounded-xl text-text-tertiary transition hover:bg-danger-soft hover:text-danger"
        type="button"
        aria-label={`Remove ${row.label}`}
        onClick={onDelete}
      >
        <Trash2 size={16} strokeWidth={1.7} />
      </button>
    </div>
  );
}

export function BucketCard({
  section,
  title,
  blurb,
  moneyIn,
  editableBucket,
  onAdd,
  onUpdate,
  onDelete
}: {
  section: FinanceSection;
  title: string;
  blurb: string;
  moneyIn: number;
  /** The bucket new lines are written to. Absent for a section read from the books. */
  editableBucket?: FinanceBucket;
  onAdd?: (input: { bucket: FinanceBucket; label: string; amount: number }) => void;
  onUpdate?: (id: string, patch: { label: string; amount: number }) => void;
  onDelete?: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");

  const editable = Boolean(editableBucket);
  const share = shareOfIncome(section.total, moneyIn);
  const isIncome = section.direction === "in";

  function submitNew() {
    const label = newLabel.trim();
    if (!label || !editableBucket || !onAdd) return;
    onAdd({ bucket: editableBucket, label, amount: parseAmount(newAmount) });
    setNewLabel("");
    setNewAmount("");
    setAdding(false);
  }

  return (
    <section className="rounded-[20px] border border-border bg-surface p-3.5 shadow-card">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-medium leading-tight text-text-primary">{title}</h2>
          <p className="mt-0.5 text-[12px] text-text-tertiary">{blurb}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[17px] font-medium leading-none tabular-nums text-text-primary">
            {formatCurrency(section.total)}
          </div>
          {!isIncome && share > 0 ? (
            <div className="mt-1 text-[11px] text-text-tertiary">{Math.round(share * 100)}% of income</div>
          ) : null}
        </div>
        {editable ? (
          <button
            className={cn(
              "focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-xl transition",
              editing
                ? "bg-accent-soft text-text-primary"
                : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
            )}
            type="button"
            aria-label={editing ? `Done editing ${title}` : `Edit ${title}`}
            aria-pressed={editing}
            onClick={() => {
              setEditing((current) => !current);
              setAdding(false);
            }}
          >
            {editing ? <Check size={16} strokeWidth={2} /> : <Pencil size={15} strokeWidth={1.7} />}
          </button>
        ) : null}
      </div>

      <div className="mt-2 divide-y divide-border/70 border-t border-border/70 pt-1">
        {section.rows.length === 0 ? (
          <div className="py-3 text-[13px] text-text-tertiary">Nothing here yet.</div>
        ) : (
          section.rows.map((row) =>
            editing && row.lineId && onUpdate && onDelete ? (
              <EditRow
                key={row.key}
                row={row}
                onSave={(patch) => onUpdate(row.lineId as string, patch)}
                onDelete={() => onDelete(row.lineId as string)}
              />
            ) : (
              <ReadRow key={row.key} row={row} />
            )
          )
        )}
      </div>

      {editable && editing ? (
        adding ? (
          <div className="mt-2 flex items-center gap-2">
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
            <input
              className="focus-ring min-h-11 w-[110px] shrink-0 rounded-xl border border-border bg-subtle px-3 text-right text-[15px] tabular-nums text-text-primary placeholder:text-text-tertiary"
              value={newAmount}
              aria-label="New line monthly amount"
              placeholder="0.00"
              inputMode="decimal"
              onChange={(event) => setNewAmount(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitNew();
                if (event.key === "Escape") setAdding(false);
              }}
            />
            {/* Enter saves, but a keyboard shortcut is not an affordance — on a
                phone there is nothing to aim at. Both buttons are here. */}
            <button
              className="focus-ring grid h-11 w-9 shrink-0 place-items-center rounded-xl text-text-secondary transition hover:bg-accent-soft hover:text-text-primary disabled:opacity-40"
              type="button"
              aria-label="Save new line"
              disabled={!newLabel.trim()}
              onClick={submitNew}
            >
              <Check size={17} strokeWidth={2} />
            </button>
            <button
              className="focus-ring grid h-11 w-9 shrink-0 place-items-center rounded-xl text-text-tertiary transition hover:bg-subtle hover:text-text-secondary"
              type="button"
              aria-label="Cancel new line"
              onClick={() => setAdding(false)}
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>
        ) : (
          <button
            className="focus-ring mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-[14px] font-medium text-text-secondary transition hover:bg-subtle hover:text-text-primary"
            type="button"
            onClick={() => setAdding(true)}
          >
            <Plus size={16} strokeWidth={2} />
            Add line
          </button>
        )
      ) : null}
    </section>
  );
}

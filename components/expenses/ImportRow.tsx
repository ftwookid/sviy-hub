"use client";

import { useRef, useState } from "react";
import {
  Ban,
  Check,
  ExternalLink,
  Flag,
  Paperclip,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  X
} from "lucide-react";
import { CategoryTag } from "@/components/CategoryTag";
import { CategoryPicker } from "@/components/expenses/CategoryPicker";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { Input, Select } from "@/components/ui/Field";
import { EXPENSE_CATEGORIES, normalizeCategory } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { formatCurrency, parseLocalDate } from "@/lib/formatters";
import { receiptViewUrl, uploadReceipt } from "@/lib/receiptUpload";
import { DECISION_HINTS, rowBlockers } from "@/lib/statementImports";
import type { Receipt } from "@/types/expense";
import type { RowDecision, StatementImportRow } from "@/types/statementImport";

const DECISION_OPTIONS: {
  decision: RowDecision;
  icon: typeof Check;
  label: string;
  active: string;
}[] = [
  { decision: "Include", icon: Check, label: "Keep in the books", active: "bg-success-soft text-success" },
  { decision: "Flag", icon: Flag, label: "Flag to decide later", active: "bg-warning-soft text-warning" },
  { decision: "Exclude", icon: Ban, label: "Not business", active: "bg-[#EAE8E3] text-text-secondary" }
];

/** "Jun 3" — the shortest form that is still unambiguous inside one statement. */
function compactDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    parseLocalDate(value)
  );
}

/** "6/3" — shorter still, for phone widths where the merchant needs the room. */
function numericDate(value: string) {
  if (!value) return "—";
  const date = parseLocalDate(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * One transaction, on one line.
 *
 * A statement runs to a hundred rows or more, so the collapsed row is sized to
 * be scanned rather than read: date, merchant, category, amount, and the three
 * decisions as icons. Everything editable is one tap away, not always on screen.
 */
export function ImportRow({
  row,
  receipt,
  userId,
  expanded,
  selected,
  onToggle,
  onSelect,
  onChange,
  onCategoryChange,
  onReceiptChange,
  onDelete
}: {
  row: StatementImportRow;
  receipt: Receipt | null;
  userId: string;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelect: (selected: boolean) => void;
  onChange: (patch: Partial<StatementImportRow>) => void;
  /** Separate from `onChange` so the page can offer to carry the pick across similar rows. */
  onCategoryChange: (category: string | null) => void;
  onReceiptChange: (receipt: Receipt | null) => void;
  onDelete: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [pickingCategory, setPickingCategory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const blockers = rowBlockers(row);
  const muted = row.decision === "Exclude";

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const result = await uploadReceipt(file, userId, row.date);
      onReceiptChange(result.receipt);
      onChange({ receipt_id: result.receipt.id });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not upload that file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function openReceipt() {
    if (!receipt) return;
    const url = await receiptViewUrl(receipt);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      className={cn("relative transition", selected && "bg-accent-soft/70", expanded && "bg-page")}
    >
      {/* A marker element, not a left border: the list's `divide-border` rule
          outranks any `border-l-*` utility and would repaint it grey. */}
      {row.decision === "Flag" || blockers.length > 0 ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-[2px]",
            row.decision === "Flag" ? "bg-warning" : "bg-danger"
          )}
        />
      ) : null}

      <div className="flex items-center gap-1.5 pl-2 pr-2">
        <input
          className="h-4 w-4 shrink-0 cursor-pointer accent-[#C9A96E]"
          type="checkbox"
          checked={selected}
          aria-label={`Select ${row.merchant || row.description || "transaction"}`}
          onChange={(event) => onSelect(event.target.checked)}
        />

        <button
          className="focus-ring flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {/* Phones need the width for the merchant name, so the date drops to
              its shortest unambiguous form there. */}
          <span
            className={cn(
              "w-[32px] shrink-0 text-meta tabular-nums sm:w-[46px]",
              muted ? "text-text-tertiary" : "text-text-secondary"
            )}
          >
            <span className="sm:hidden">{numericDate(row.date)}</span>
            <span className="hidden sm:inline">{compactDate(row.date)}</span>
          </span>

          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span
              className={cn(
                "truncate text-body",
                muted ? "text-text-tertiary" : "font-medium text-text-primary"
              )}
            >
              {row.merchant || row.description || "Untitled transaction"}
            </span>
            {row.confidence === "low" ? (
              <TriangleAlert
                size={12}
                strokeWidth={2.2}
                className="shrink-0 text-warning"
                aria-label="Hard to read — check this one"
              />
            ) : null}
            {row.auto_applied ? (
              <Sparkles
                size={12}
                strokeWidth={2.2}
                className="shrink-0 text-accent"
                aria-label="Pre-filled from a previous statement"
              />
            ) : null}
            {row.receipt_id ? (
              <Paperclip
                size={12}
                strokeWidth={2.2}
                className="shrink-0 text-success"
                aria-label="Invoice attached"
              />
            ) : null}
          </span>

          {/* Both columns are fixed width. Sizing them to their own contents is
              what made the amount slide left and right from row to row. */}
          <span
            className={cn(
              "w-[86px] shrink-0 text-right text-list font-medium tabular-nums",
              row.direction === "Credit"
                ? "text-success"
                : muted
                  ? "text-text-tertiary"
                  : "text-text-primary"
            )}
          >
            {row.direction === "Credit" ? "+" : ""}
            {formatCurrency(row.amount)}
          </span>
        </button>

        {/* Changing a category is the most common single edit, so it does not
            require opening the row. */}
        <button
          className="focus-ring hidden w-[116px] shrink-0 items-center rounded-md transition hover:brightness-[0.97] md:flex"
          type="button"
          aria-label={`Category: ${row.category ?? "none"}. Change it`}
          onClick={() => setPickingCategory(true)}
        >
          {row.category ? (
            <CategoryTag category={row.category} fixedWidth />
          ) : (
            <span className="w-full rounded-md border border-dashed border-border-emphasis px-2 py-1 text-center text-caption text-text-tertiary">
              Set category
            </span>
          )}
        </button>

        {/* Once a row is in the books its decision is settled — this list can no
            longer change it, and offering the buttons anyway invites edits that
            silently go nowhere. */}
        {row.expense_id ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-success-soft px-2 py-1 text-caption font-medium text-success">
            <Check size={12} strokeWidth={2.4} />
            <span className="hidden sm:inline">In your books</span>
          </span>
        ) : (
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-subtle p-0.5">
          {DECISION_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isActive = row.decision === option.decision;
            return (
              <button
                key={option.decision}
                className={cn(
                  "focus-ring grid h-7 w-7 place-items-center rounded-md transition",
                  isActive ? option.active : "text-text-tertiary hover:bg-border"
                )}
                type="button"
                title={option.label}
                aria-label={option.label}
                aria-pressed={isActive}
                onClick={() => onChange({ decision: option.decision })}
              >
                <Icon size={14} strokeWidth={isActive ? 2.4 : 1.9} />
              </button>
            );
          })}
        </div>
        )}
      </div>

      {blockers.length > 0 && !expanded ? (
        <p className="pb-1.5 pl-[34px] pr-2 text-caption text-danger">{blockers.join(" · ")}</p>
      ) : null}

      {expanded ? (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <p className="text-meta text-text-tertiary">
            {row.expense_id
              ? "Already in your books. Edit it from the transactions list."
              : DECISION_HINTS[row.decision]}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <DateField label="Date" value={row.date} onChange={(date) => onChange({ date })} />
            <Input
              label="Amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={String(row.amount)}
              onChange={(event) => onChange({ amount: Number(event.target.value) })}
            />
            <Input
              label="Merchant"
              placeholder="Chewy"
              value={row.merchant}
              onChange={(event) => onChange({ merchant: event.target.value })}
            />
            <Select
              label="Category"
              // A row still carrying an old Schedule C heading matches no option
              // here, which would show the wrong one as selected.
              value={normalizeCategory(row.category) ?? ""}
              onChange={(event) => onCategoryChange(event.target.value || null)}
            >
              <option value="">Choose a category</option>
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </div>

          <Input
            label="Note"
            placeholder="What this was for"
            value={row.notes ?? ""}
            onChange={(event) => onChange({ notes: event.target.value || null })}
          />

          <div>
            <span className="mb-1.5 block text-caption font-medium uppercase tracking-[0.05em] text-text-tertiary">
              Invoice
            </span>
            {receipt ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-subtle px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Paperclip size={14} strokeWidth={1.8} className="shrink-0 text-success" />
                  <div className="min-w-0">
                    <div className="truncate text-list font-medium text-text-primary">
                      {receipt.filename}
                    </div>
                    <div className="text-caption text-text-tertiary">
                      {receipt.drive_synced_at ? "Archived in Drive" : "Archives once you import"}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-text-secondary transition hover:bg-border"
                    type="button"
                    aria-label="Open invoice"
                    onClick={openReceipt}
                  >
                    <ExternalLink size={15} strokeWidth={1.8} />
                  </button>
                  <button
                    className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-text-secondary transition hover:bg-border"
                    type="button"
                    aria-label="Remove invoice"
                    onClick={() => {
                      onReceiptChange(null);
                      onChange({ receipt_id: null });
                    }}
                  >
                    <X size={15} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            ) : (
              <label
                className={cn(
                  "focus-ring-within flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-emphasis bg-subtle px-3 text-list text-text-secondary transition hover:bg-border",
                  uploading && "pointer-events-none opacity-60"
                )}
              >
                <Upload size={15} strokeWidth={1.7} />
                {uploading ? "Uploading..." : "Attach invoice or receipt"}
                <input
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  disabled={uploading}
                  onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                />
              </label>
            )}
            {uploadError ? <p className="mt-1.5 text-meta text-danger">{uploadError}</p> : null}
          </div>

          {row.description && row.description !== row.merchant ? (
            <p className="text-caption text-text-tertiary">
              On the statement: <span className="text-text-secondary">{row.description}</span>
            </p>
          ) : null}

          {/* Removing an imported row would drop the review record and leave the
              expense behind with nothing pointing at it. */}
          {row.expense_id ? null : (
            <Button className="w-full sm:w-auto" variant="danger" type="button" onClick={onDelete}>
              <Trash2 size={15} strokeWidth={1.8} />
              Remove from this list
            </Button>
          )}
        </div>
      ) : null}

      {pickingCategory ? (
        <CategoryPicker
          title={row.merchant || "Choose a category"}
          current={row.category}
          onPick={(category) => {
            setPickingCategory(false);
            onCategoryChange(category);
          }}
          onClose={() => setPickingCategory(false)}
        />
      ) : null}
    </div>
  );
}

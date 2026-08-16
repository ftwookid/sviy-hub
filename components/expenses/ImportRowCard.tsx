"use client";

import { useRef, useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  Paperclip,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  X
} from "lucide-react";
import { CategoryTag } from "@/components/CategoryTag";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { Input, Select } from "@/components/ui/Field";
import { SCHEDULE_C_CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { formatCurrency, formatShortDate } from "@/lib/formatters";
import { receiptViewUrl, uploadReceipt } from "@/lib/receiptUpload";
import { DECISION_HINTS, DECISION_LABELS, ROW_DECISIONS, rowBlockers } from "@/lib/statementImports";
import type { Receipt } from "@/types/expense";
import type { RowDecision, StatementImportRow } from "@/types/statementImport";

const DECISION_STYLES: Record<RowDecision, string> = {
  Include: "bg-surface text-text-primary shadow-sm",
  Flag: "bg-warning-soft text-warning shadow-sm",
  Exclude: "bg-[#F1F0ED] text-text-tertiary shadow-sm"
};

export function ImportRowCard({
  row,
  receipt,
  userId,
  expanded,
  onToggle,
  onChange,
  onReceiptChange,
  onDelete
}: {
  row: StatementImportRow;
  receipt: Receipt | null;
  userId: string;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<StatementImportRow>) => void;
  onReceiptChange: (receipt: Receipt | null) => void;
  onDelete: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
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
    <article
      className={cn(
        "overflow-hidden rounded-[18px] border bg-surface transition",
        row.decision === "Flag" ? "border-warning/40" : "border-border",
        muted && "opacity-60"
      )}
    >
      {/* Summary — the row as it will read in the books */}
      <button
        className="focus-ring flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
        type="button"
        onClick={onToggle}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-medium text-text-primary">
              {row.merchant || row.description || "Untitled transaction"}
            </span>
            {row.confidence === "low" ? (
              <TriangleAlert
                size={13}
                strokeWidth={2}
                className="shrink-0 text-warning"
                aria-label="Hard to read — check this one"
              />
            ) : null}
            {row.auto_applied ? (
              <Sparkles
                size={13}
                strokeWidth={2}
                className="shrink-0 text-accent"
                aria-label="Pre-filled from a previous statement"
              />
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-tertiary">
            <span>{row.date ? formatShortDate(row.date) : "No date"}</span>
            {row.category ? (
              <>
                <span aria-hidden>·</span>
                <CategoryTag category={row.category} />
              </>
            ) : null}
            {row.direction === "Credit" ? (
              <>
                <span aria-hidden>·</span>
                <span className="text-success">Money in</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <div className="text-[15px] font-medium tabular-nums text-text-primary">
              {formatCurrency(row.amount)}
            </div>
            <div
              className={cn(
                "mt-0.5 text-[11px] font-medium",
                row.receipt_id ? "text-success" : "text-text-tertiary"
              )}
            >
              {row.receipt_id ? "Invoice ✓" : "No invoice"}
            </div>
          </div>
          <ChevronDown
            size={16}
            strokeWidth={1.8}
            className={cn("text-text-tertiary transition", expanded && "rotate-180")}
          />
        </div>
      </button>

      {/* Decision — always reachable without opening the row */}
      <div className="px-3 pb-3">
        <div className="grid min-h-10 grid-cols-3 rounded-xl border border-border bg-subtle p-1">
          {ROW_DECISIONS.map((decision) => (
            <button
              key={decision}
              className={cn(
                "focus-ring rounded-lg text-[12px] font-medium transition duration-150 ease-out sm:text-[13px]",
                row.decision === decision ? DECISION_STYLES[decision] : "text-text-secondary"
              )}
              type="button"
              onClick={() => onChange({ decision })}
            >
              {DECISION_LABELS[decision]}
            </button>
          ))}
        </div>
      </div>

      {blockers.length > 0 && !expanded ? (
        <p className="px-3 pb-3 text-[12px] text-danger">{blockers[0]}</p>
      ) : null}

      {expanded ? (
        <div className="space-y-4 border-t border-border bg-page px-3 py-4">
          <p className="text-[12px] text-text-tertiary">{DECISION_HINTS[row.decision]}</p>

          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

          <Input
            label="Merchant"
            placeholder="Chewy"
            value={row.merchant}
            onChange={(event) => onChange({ merchant: event.target.value })}
          />

          <Select
            label="Category"
            value={row.category ?? ""}
            onChange={(event) => onChange({ category: event.target.value || null })}
          >
            <option value="">Choose a category</option>
            {SCHEDULE_C_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>

          <Input
            label="Note"
            placeholder="What this was for"
            value={row.notes ?? ""}
            onChange={(event) => onChange({ notes: event.target.value || null })}
          />

          {/* Invoice */}
          <div>
            <span className="mb-2 block text-[12px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
              Invoice
            </span>
            {receipt ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-subtle px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Paperclip size={15} strokeWidth={1.7} className="shrink-0 text-success" />
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-text-primary">
                      {receipt.filename}
                    </div>
                    <div className="text-[12px] text-text-tertiary">
                      {receipt.drive_synced_at ? "Archived in Drive" : "Archives once you import"}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    className="h-9 w-9 px-0"
                    variant="ghost"
                    type="button"
                    aria-label="Open invoice"
                    onClick={openReceipt}
                  >
                    <ExternalLink size={16} strokeWidth={1.7} />
                  </Button>
                  <Button
                    className="h-9 w-9 px-0"
                    variant="ghost"
                    type="button"
                    aria-label="Remove invoice"
                    onClick={() => {
                      onReceiptChange(null);
                      onChange({ receipt_id: null });
                    }}
                  >
                    <X size={16} strokeWidth={1.7} />
                  </Button>
                </div>
              </div>
            ) : (
              <label
                className={cn(
                  "focus-ring flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-emphasis bg-subtle px-3 text-[14px] text-text-secondary transition hover:bg-border",
                  uploading && "pointer-events-none opacity-60"
                )}
              >
                <Upload size={16} strokeWidth={1.6} />
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
            {uploadError ? <p className="mt-2 text-[12px] text-danger">{uploadError}</p> : null}
          </div>

          {row.description && row.description !== row.merchant ? (
            <p className="text-[12px] text-text-tertiary">
              On the statement: <span className="text-text-secondary">{row.description}</span>
            </p>
          ) : null}

          {blockers.length > 0 ? (
            <p className="text-[13px] text-danger">{blockers.join(" · ")}</p>
          ) : null}

          <Button className="w-full sm:w-auto" variant="danger" type="button" onClick={onDelete}>
            <Trash2 size={16} strokeWidth={1.7} />
            Remove from this list
          </Button>
        </div>
      ) : null}
    </article>
  );
}

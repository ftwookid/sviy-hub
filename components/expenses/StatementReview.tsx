"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Ban, Check, Flag, Plus, Tag } from "lucide-react";
import { BulkAction, BulkBar } from "@/components/expenses/BulkBar";
import { CategoryPicker } from "@/components/expenses/CategoryPicker";
import { ImportRow } from "@/components/expenses/ImportRow";
import { ImportSummaryCard } from "@/components/expenses/ImportSummaryCard";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { formatCurrency, todayInputValue } from "@/lib/formatters";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import {
  addManualRow,
  confirmImport,
  deleteRow,
  discardImport,
  loadImport,
  loadRows,
  saveRow
} from "@/lib/statementImportClient";
import { decisionCounts, rowBlockers, rowTotal } from "@/lib/statementImports";
import { supabase } from "@/lib/supabase";
import type { PaymentMethod, Receipt } from "@/types/expense";
import type { RowDecision, StatementImportRow, StatementImport } from "@/types/statementImport";

type Filter = "All" | "Needs a look" | "Include" | "Exclude";

/**
 * A row the user should not skip past: flagged, hard to read, or missing
 * something it needs before it can be written to the books.
 */
function needsALook(row: StatementImportRow) {
  return row.decision === "Flag" || row.confidence === "low" || rowBlockers(row).length > 0;
}

/**
 * Reviewing a scanned statement, hosted inside the transactions page.
 *
 * A statement runs to a hundred rows or more, and they are usually wrong in
 * bulk rather than one at a time — a month of personal spending all defaults to
 * Include. So the page is built around acting on many rows at once: select a
 * filter, select everything in it, and make one decision for the lot.
 */
export function StatementReview({
  importId,
  userId,
  ownerLabel,
  onBack,
  onImported,
  onDiscarded,
  showToast
}: {
  importId: string;
  userId: string;
  ownerLabel?: string;
  onBack: () => void;
  onImported: () => void;
  onDiscarded: () => void;
  showToast: (message: string) => void;
}) {
  const [statementImport, setStatementImport] = useState<StatementImport | null>(null);
  const [rows, setRows] = useState<StatementImportRow[]>([]);
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("All");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Main card");
  const [importing, setImporting] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [pickingBulkCategory, setPickingBulkCategory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [record, rowList] = await Promise.all([loadImport(importId), loadRows(importId)]);
    setStatementImport(record);
    setRows(rowList);
    setSelectedIds(new Set());

    const receiptIds = Array.from(
      new Set(rowList.map((row) => row.receipt_id).filter(Boolean))
    ) as string[];

    if (receiptIds.length > 0 && supabase) {
      const { data } = await supabase.from("receipts").select("*").in("id", receiptIds);
      const byId: Record<string, Receipt> = {};
      ((data ?? []) as Receipt[]).forEach((receipt) => {
        byId[receipt.id] = receipt;
      });
      setReceipts(byId);
    } else {
      setReceipts({});
    }

    setLoading(false);
  }, [importId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Optimistic locally, persisted immediately — a half-done review survives a refresh. */
  function updateRow(rowId: string, patch: Partial<StatementImportRow>) {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
    saveRow(rowId, patch).catch(() => showToast("That change did not save. Check your connection."));
  }

  /** One change across a selection. The whole point of the page. */
  function patchSelected(patch: Partial<StatementImportRow>, describe: (n: number) => string) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setRows((current) => current.map((row) => (selectedIds.has(row.id) ? { ...row, ...patch } : row)));
    setSelectedIds(new Set());

    Promise.all(ids.map((id) => saveRow(id, patch)))
      .then(() => showToast(describe(ids.length)))
      .catch(() => showToast("Some of those changes did not save. Check your connection."));
  }

  function decideSelected(decision: RowDecision) {
    const label = decision === "Exclude" ? "not business" : decision.toLowerCase();
    patchSelected({ decision }, (n) => `${n} transaction${n === 1 ? "" : "s"} set to ${label}`);
  }

  function categoriseSelected(category: string) {
    setPickingBulkCategory(false);
    patchSelected({ category }, (n) => `${n} transaction${n === 1 ? "" : "s"} set to ${category}`);
  }

  async function handleAddManual() {
    try {
      const nextIndex = rows.reduce((max, row) => Math.max(max, row.row_index), -1) + 1;
      const created = await addManualRow(importId, userId, nextIndex, todayInputValue());
      setRows((current) => [...current, created]);
      setExpandedId(created.id);
      setFilter("All");
    } catch {
      showToast("Could not add a transaction.");
    }
  }

  async function handleDeleteRow(rowId: string) {
    setRows((current) => current.filter((row) => row.id !== rowId));
    try {
      await deleteRow(rowId);
    } catch {
      showToast("Could not remove that transaction.");
    }
  }

  async function handleImport() {
    setImporting(true);
    try {
      const result = await confirmImport({ importId, userId, rows, paymentMethod });

      showToast(
        result.complete
          ? `${result.imported} transaction${result.imported === 1 ? "" : "s"} added to your books`
          : `${result.imported} added · ${result.flagged} still flagged for you to decide`
      );

      await load();
      onImported();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not import these transactions.");
    } finally {
      setImporting(false);
    }
  }

  async function handleDiscard() {
    try {
      await discardImport(importId);
      setConfirmingDiscard(false);
      onDiscarded();
    } catch {
      setConfirmingDiscard(false);
      showToast("Could not discard that import.");
    }
  }

  const counts = useMemo(() => decisionCounts(rows), [rows]);
  const lookCount = useMemo(() => rows.filter(needsALook).length, [rows]);
  const includedRows = useMemo(() => rows.filter((row) => row.decision === "Include"), [rows]);
  const pendingRows = useMemo(() => includedRows.filter((row) => !row.expense_id), [includedRows]);
  const blocked = useMemo(
    () => pendingRows.filter((row) => rowBlockers(row).length > 0).length,
    [pendingRows]
  );

  const visibleRows = useMemo(() => {
    if (filter === "All") return rows;
    if (filter === "Needs a look") return rows.filter(needsALook);
    return rows.filter((row) => row.decision === filter);
  }, [filter, rows]);

  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selectedIds.has(row.id));

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleRows.forEach((row) => next.delete(row.id));
      } else {
        visibleRows.forEach((row) => next.add(row.id));
      }
      return next;
    });
  }

  function toggleOne(rowId: string, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  }

  const filters: { key: Filter; label: string; count: number; tone?: "warning" }[] = [
    { key: "All", label: "All", count: rows.length },
    { key: "Needs a look", label: "Needs a look", count: lookCount, tone: "warning" },
    { key: "Include", label: "Keeping", count: counts.include },
    { key: "Exclude", label: "Not business", count: counts.exclude }
  ];

  if (loading && !statementImport) {
    return (
      <div className="space-y-3">
        <SkeletonRows />
      </div>
    );
  }

  if (!statementImport) {
    return (
      <div className="rounded-[18px] border border-border bg-surface px-4 py-8 text-center">
        <p className="text-[14px] text-text-secondary">That statement could not be opened.</p>
        <Button className="mt-4" variant="soft" type="button" onClick={onBack}>
          Back to transactions
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        className="focus-ring inline-flex items-center gap-1.5 text-[13px] text-text-secondary transition hover:text-text-primary"
        type="button"
        onClick={onBack}
      >
        <ArrowLeft size={15} strokeWidth={1.9} />
        Back to transactions
      </button>

      <ImportSummaryCard statementImport={statementImport} ownerLabel={ownerLabel} />

      {statementImport.parse_error ? (
        <p className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {statementImport.parse_error}
        </p>
      ) : null}

      {/* No overflow-hidden on the section: it would clip the sticky toolbar to
          the card and stop it tracking the page scroll. The rows are clipped
          instead, which is all the rounded corners actually needed. */}
      <section className="rounded-[20px] border border-border bg-surface shadow-card">
        {/* The toolbar stays put through a long list — filters and select-all are
            needed most at row 80, which is exactly where a static header is gone. */}
        <div className="sticky top-0 z-20 rounded-t-[19px] border-b border-border bg-surface/95 backdrop-blur-sm">
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-2.5 py-2">
            {filters.map((option) => (
              <button
                key={option.key}
                className={cn(
                  "focus-ring inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium transition",
                  filter === option.key
                    ? "bg-text-primary text-white"
                    : "bg-subtle text-text-secondary hover:text-text-primary"
                )}
                type="button"
                onClick={() => setFilter(option.key)}
              >
                {option.label}
                <span
                  className={cn(
                    "tabular-nums",
                    filter === option.key
                      ? "text-white/70"
                      : option.tone === "warning" && option.count > 0
                        ? "font-semibold text-warning"
                        : "text-text-tertiary"
                  )}
                >
                  {option.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-border px-2.5 py-1.5">
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[12px] text-text-secondary">
              <input
                className="h-4 w-4 cursor-pointer accent-[#C9A96E]"
                type="checkbox"
                checked={allVisibleSelected}
                disabled={visibleRows.length === 0}
                onChange={toggleSelectAll}
              />
              {allVisibleSelected ? "Clear" : `Select all ${visibleRows.length}`}
            </label>
            <span className="ml-auto truncate text-[12px] text-text-tertiary">
              {counts.include} to import
              <span className="hidden sm:inline">
                {" "}
                · {formatCurrency(rowTotal(includedRows))}
              </span>
            </span>
            <button
              className="focus-ring inline-flex min-h-7 shrink-0 items-center gap-1 rounded-lg bg-subtle px-2 text-[12px] font-medium text-text-primary transition hover:bg-border"
              type="button"
              onClick={handleAddManual}
            >
              <Plus size={13} strokeWidth={2.2} />
              Add one
            </button>
          </div>
        </div>

        <div className="divide-y divide-border overflow-hidden rounded-b-[19px]">
          {visibleRows.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="mx-auto max-w-sm text-[13.5px] text-text-secondary">
                {rows.length === 0
                  ? "The scan found no transactions on this statement. Add them by hand, or try a different PDF."
                  : filter === "Needs a look"
                    ? "Nothing needs a second look. Every transaction is readable and has what it needs."
                    : "No transactions in this view."}
              </p>
            </div>
          ) : (
            visibleRows.map((row) => (
              <ImportRow
                key={row.id}
                row={row}
                receipt={row.receipt_id ? receipts[row.receipt_id] ?? null : null}
                userId={userId}
                expanded={expandedId === row.id}
                selected={selectedIds.has(row.id)}
                onToggle={() => setExpandedId((current) => (current === row.id ? null : row.id))}
                onSelect={(selected) => toggleOne(row.id, selected)}
                onChange={(patch) => updateRow(row.id, patch)}
                onReceiptChange={(receipt) =>
                  setReceipts((current) => {
                    if (!receipt) return current;
                    return { ...current, [receipt.id]: receipt };
                  })
                }
                onDelete={() => handleDeleteRow(row.id)}
              />
            ))
          )}
        </div>
      </section>

      <section className="space-y-2.5 rounded-[20px] border border-border bg-surface p-3.5 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
            Paid with
          </span>
          <div className="flex min-h-9 gap-0.5 rounded-xl border border-border bg-subtle p-0.5">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method}
                className={cn(
                  "focus-ring rounded-[10px] px-3 text-[13px] font-medium transition duration-150 ease-out",
                  paymentMethod === method
                    ? "bg-surface text-text-primary shadow-sm"
                    : "text-text-secondary"
                )}
                type="button"
                onClick={() => setPaymentMethod(method as PaymentMethod)}
              >
                {method}
              </button>
            ))}
          </div>
        </div>

        {blocked > 0 ? (
          <p className="text-[13px] text-danger">
            {blocked} transaction{blocked === 1 ? " is" : "s are"} missing something.{" "}
            <button
              className="focus-ring font-medium underline"
              type="button"
              onClick={() => setFilter("Needs a look")}
            >
              Show {blocked === 1 ? "it" : "them"}
            </button>
          </p>
        ) : null}

        {counts.flag > 0 ? (
          <p className="text-[13px] text-text-secondary">
            {counts.flag} flagged transaction{counts.flag === 1 ? "" : "s"} will stay here until you
            decide. Importing now leaves them untouched.
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="w-full sm:flex-1"
            variant="accent"
            type="button"
            disabled={importing || pendingRows.length === 0 || blocked > 0}
            onClick={handleImport}
          >
            {importing
              ? "Importing..."
              : pendingRows.length === 0
                ? "Nothing left to import"
                : `Import ${pendingRows.length} transaction${pendingRows.length === 1 ? "" : "s"}`}
          </Button>
          <Button
            className="w-full sm:w-auto"
            variant="ghost"
            type="button"
            onClick={() => setConfirmingDiscard(true)}
          >
            Discard
          </Button>
        </div>
      </section>

      <BulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <BulkAction icon={Check} label="Keep" onClick={() => decideSelected("Include")} />
        <BulkAction icon={Flag} label="Flag" onClick={() => decideSelected("Flag")} />
        <BulkAction icon={Ban} label="Not business" onClick={() => decideSelected("Exclude")} />
        <BulkAction icon={Tag} label="Category" onClick={() => setPickingBulkCategory(true)} />
      </BulkBar>

      {pickingBulkCategory ? (
        <CategoryPicker
          title={`Category for ${selectedIds.size} transaction${selectedIds.size === 1 ? "" : "s"}`}
          onPick={categoriseSelected}
          onClose={() => setPickingBulkCategory(false)}
        />
      ) : null}

      {confirmingDiscard ? (
        <ConfirmDialog
          title="Discard this import?"
          description="The scanned list is removed. Transactions you already imported stay in your books, and the statement PDF stays in storage."
          confirmLabel="Discard"
          cancelLabel="Keep it"
          onConfirm={handleDiscard}
          onCancel={() => setConfirmingDiscard(false)}
        />
      ) : null}
    </div>
  );
}

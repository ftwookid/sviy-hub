"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { ImportRowCard } from "@/components/expenses/ImportRowCard";
import { ImportSummaryCard } from "@/components/expenses/ImportSummaryCard";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FieldShell } from "@/components/ui/Field";
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
import type { StatementImportRow, StatementImport } from "@/types/statementImport";

type Filter = "All" | "Include" | "Flag" | "Exclude";

/**
 * Reviewing a scanned statement, hosted inside the transactions page.
 *
 * It takes over the page while it is open: going through a hundred rows is a
 * focused job, and leaving the month's list underneath it would only compete.
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
  const [filter, setFilter] = useState<Filter>("All");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Main card");
  const [importing, setImporting] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [record, rowList] = await Promise.all([loadImport(importId), loadRows(importId)]);
    setStatementImport(record);
    setRows(rowList);

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
  const includedRows = useMemo(() => rows.filter((row) => row.decision === "Include"), [rows]);
  const pendingRows = useMemo(() => includedRows.filter((row) => !row.expense_id), [includedRows]);
  const blocked = useMemo(
    () => pendingRows.filter((row) => rowBlockers(row).length > 0).length,
    [pendingRows]
  );
  const visibleRows = useMemo(
    () => (filter === "All" ? rows : rows.filter((row) => row.decision === filter)),
    [filter, rows]
  );

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

      <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <span className="text-[15px] font-medium text-text-primary">
              {rows.length} transaction{rows.length === 1 ? "" : "s"}
            </span>
            <span className="ml-2 text-[12.5px] text-text-secondary">
              {counts.include} to import · {formatCurrency(rowTotal(includedRows))}
              {counts.flag > 0 ? ` · ${counts.flag} flagged` : ""}
            </span>
          </div>
          <button
            className="focus-ring inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-subtle px-3 text-[13px] font-medium text-text-primary transition hover:bg-border"
            type="button"
            onClick={handleAddManual}
          >
            <Plus size={15} strokeWidth={2} />
            Add one
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
          {(["All", "Include", "Flag", "Exclude"] as Filter[]).map((option) => (
            <button
              key={option}
              className={cn(
                "focus-ring min-h-8 rounded-lg px-2.5 text-[12.5px] font-medium transition",
                filter === option
                  ? "bg-text-primary text-white"
                  : "bg-subtle text-text-secondary hover:text-text-primary"
              )}
              type="button"
              onClick={() => setFilter(option)}
            >
              {option === "All"
                ? `All ${rows.length}`
                : option === "Include"
                  ? `Keeping ${counts.include}`
                  : option === "Flag"
                    ? `Flagged ${counts.flag}`
                    : `Not business ${counts.exclude}`}
            </button>
          ))}
        </div>

        <div className="space-y-2 p-2.5 sm:p-3">
          {visibleRows.length === 0 ? (
            <div className="rounded-[16px] border border-border bg-page px-4 py-8 text-center">
              <p className="mx-auto max-w-sm text-[14px] text-text-secondary">
                {rows.length === 0
                  ? "The scan found no transactions on this statement. Add them by hand, or try a different PDF."
                  : "No transactions in this view."}
              </p>
            </div>
          ) : (
            visibleRows.map((row) => (
              <ImportRowCard
                key={row.id}
                row={row}
                receipt={row.receipt_id ? receipts[row.receipt_id] ?? null : null}
                userId={userId}
                expanded={expandedId === row.id}
                onToggle={() => setExpandedId((current) => (current === row.id ? null : row.id))}
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

      <section className="space-y-3 rounded-[20px] border border-border bg-surface p-3.5 shadow-card">
        <FieldShell label="Paid with">
          <div className="grid min-h-10 grid-cols-3 rounded-xl border border-border bg-subtle p-0.5">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method}
                className={cn(
                  "focus-ring rounded-[10px] text-[13px] font-medium transition duration-150 ease-out",
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
        </FieldShell>

        {blocked > 0 ? (
          <p className="text-[13px] text-danger">
            {blocked} transaction{blocked === 1 ? " is" : "s are"} missing a category, amount, or
            merchant. Open {blocked === 1 ? "it" : "them"} to finish before importing.
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

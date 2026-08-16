"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ExpenseSectionTabs } from "@/components/ExpenseSectionTabs";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { ImportRowCard } from "@/components/expenses/ImportRowCard";
import { ImportSummaryCard } from "@/components/expenses/ImportSummaryCard";
import { StatementDropzone } from "@/components/expenses/StatementDropzone";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FieldShell } from "@/components/ui/Field";
import { Toast } from "@/components/ui/Toast";
import { authedFetch } from "@/lib/apiClient";
import { cn } from "@/lib/cn";
import { periodMonthLabel } from "@/lib/expenses";
import { formatCurrency, todayInputValue } from "@/lib/formatters";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import {
  addManualRow,
  confirmImport,
  deleteRow,
  discardImport,
  loadImport,
  loadImports,
  loadRows,
  saveRow,
  scanStatement
} from "@/lib/statementImportClient";
import { decisionCounts, rowBlockers, rowTotal } from "@/lib/statementImports";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { PaymentMethod, Receipt } from "@/types/expense";
import type { StatementImport, StatementImportRow } from "@/types/statementImport";

type Filter = "All" | "Include" | "Flag" | "Exclude";

export default function ImportPage() {
  const { user, isAdmin, authLoading } = useAuthUser();

  const [imports, setImports] = useState<StatementImport[]>([]);
  const [ownerLabels, setOwnerLabels] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeImport, setActiveImport] = useState<StatementImport | null>(null);
  const [rows, setRows] = useState<StatementImportRow[]>([]);
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Main card");
  const [importing, setImporting] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [toast, setToast] = useState("");

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3500);
  }

  const refreshImports = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const list = await loadImports(user.id, isAdmin);
      setImports(list);
      setLoadError("");

      // Admins work across everyone's statements, so each one needs an owner.
      if (isAdmin && list.length > 0) {
        const userIds = Array.from(new Set(list.map((item) => item.user_id)));
        try {
          const { labels } = await authedFetch<{ labels: Record<string, string> }>(
            "/api/admin/user-labels",
            { method: "POST", body: JSON.stringify({ userIds }) }
          );
          setOwnerLabels(labels ?? {});
        } catch {
          // Owner labels are a nicety; the imports themselves still load.
        }
      }
    } catch {
      setLoadError(
        "Statement import tables are not ready yet. Run supabase/statement-import-schema.sql in Supabase."
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  useEffect(() => {
    refreshImports();
  }, [refreshImports]);

  const openImport = useCallback(async (importId: string) => {
    setActiveId(importId);
    setExpandedId(null);
    setFilter("All");

    const [record, rowList] = await Promise.all([loadImport(importId), loadRows(importId)]);
    setActiveImport(record);
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
  }, []);

  async function handleFile(file: File) {
    setScanning(true);
    setScanError("");
    try {
      const { importId } = await scanStatement(file);
      await refreshImports();
      await openImport(importId);
      showToast("Statement scanned — go through the list below");
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "The statement could not be scanned.");
    } finally {
      setScanning(false);
    }
  }

  /** Optimistic locally, persisted immediately — a half-done review survives a refresh. */
  function updateRow(rowId: string, patch: Partial<StatementImportRow>) {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
    saveRow(rowId, patch).catch(() =>
      showToast("That change did not save. Check your connection.")
    );
  }

  async function handleAddManual() {
    if (!activeId || !user) return;
    try {
      const nextIndex = rows.reduce((max, row) => Math.max(max, row.row_index), -1) + 1;
      const created = await addManualRow(activeId, user.id, nextIndex, todayInputValue());
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
    if (!activeId || !user) return;
    setImporting(true);
    try {
      const result = await confirmImport({
        importId: activeId,
        userId: user.id,
        rows,
        paymentMethod
      });

      showToast(
        result.complete
          ? `${result.imported} transaction${result.imported === 1 ? "" : "s"} added to your books`
          : `${result.imported} added · ${result.flagged} still flagged for you to decide`
      );

      await refreshImports();
      await openImport(activeId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not import these transactions.");
    } finally {
      setImporting(false);
    }
  }

  async function handleDiscard() {
    if (!activeId) return;
    try {
      await discardImport(activeId);
      setConfirmingDiscard(false);
      setActiveId(null);
      setActiveImport(null);
      setRows([]);
      await refreshImports();
      showToast("Import discarded");
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

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      <div className="space-y-5">
        <div>
          <h1 className="text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-text-primary sm:text-[34px]">
            Import
          </h1>
          <p className="mt-2 text-[15px] text-text-secondary sm:text-[16px]">
            Drop a bank statement and keep only the transactions that belong in your books.
          </p>
        </div>

        <ExpenseSectionTabs />

        {loadError ? (
          <section className="rounded-[20px] border border-warning/30 bg-warning-soft px-4 py-5">
            <h3 className="text-[17px] font-medium text-text-primary">Import needs database setup</h3>
            <p className="mt-2 text-[14px] text-text-secondary">{loadError}</p>
          </section>
        ) : null}

        {!activeImport ? (
          <>
            <StatementDropzone scanning={scanning} error={scanError} onFile={handleFile} />

            {!loading && imports.length > 0 ? (
              <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
                <div className="border-b border-border p-3.5 sm:p-4">
                  <h2 className="text-[19px] font-medium text-text-primary">Statements</h2>
                  <p className="mt-1 text-[13px] text-text-secondary">
                    Pick one up where you left off.
                  </p>
                </div>
                <div className="space-y-2 p-2.5 sm:p-4">
                  {imports.map((item) => (
                    <button
                      key={item.id}
                      className="focus-ring flex w-full items-center justify-between gap-3 rounded-2xl bg-subtle px-3 py-3 text-left transition hover:bg-border"
                      type="button"
                      onClick={() => openImport(item.id)}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FileText size={16} strokeWidth={1.7} className="shrink-0 text-text-tertiary" />
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-medium text-text-primary">
                            {item.institution || item.filename}
                          </div>
                          <div className="mt-0.5 text-[12px] text-text-tertiary">
                            {item.period_month ? periodMonthLabel(item.period_month) : "Period unknown"}
                            {isAdmin && ownerLabels[item.user_id]
                              ? ` · ${ownerLabels[item.user_id]}`
                              : ""}
                          </div>
                        </div>
                      </div>
                      <StatusChip status={item.status} />
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <>
            <button
              className="focus-ring inline-flex items-center gap-1.5 text-[14px] text-text-secondary transition hover:text-text-primary"
              type="button"
              onClick={() => {
                setActiveId(null);
                setActiveImport(null);
                setRows([]);
              }}
            >
              <ArrowLeft size={16} strokeWidth={1.8} />
              All statements
            </button>

            <ImportSummaryCard
              statementImport={activeImport}
              ownerLabel={isAdmin ? ownerLabels[activeImport.user_id] : undefined}
            />

            {activeImport.parse_error ? (
              <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[13px] text-danger">
                {activeImport.parse_error}
              </p>
            ) : null}

            {/* Review */}
            <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card sm:rounded-[24px]">
              <div className="space-y-3 border-b border-border p-3.5 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[19px] font-medium text-text-primary sm:text-[22px]">
                      {rows.length} transaction{rows.length === 1 ? "" : "s"}
                    </h2>
                    <p className="mt-1 text-[13px] text-text-secondary">
                      {counts.include} to import · {formatCurrency(rowTotal(includedRows))}
                      {counts.flag > 0 ? ` · ${counts.flag} flagged` : ""}
                    </p>
                  </div>
                  <Button variant="soft" type="button" onClick={handleAddManual}>
                    <Plus size={17} strokeWidth={1.7} />
                    Add one
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(["All", "Include", "Flag", "Exclude"] as Filter[]).map((option) => (
                    <button
                      key={option}
                      className={cn(
                        "focus-ring min-h-9 rounded-xl px-3 text-[13px] font-medium transition",
                        filter === option
                          ? "bg-text-primary text-white"
                          : "bg-subtle text-text-secondary hover:text-text-primary"
                      )}
                      type="button"
                      onClick={() => setFilter(option)}
                    >
                      {option === "All"
                        ? `All (${rows.length})`
                        : option === "Include"
                          ? `Keeping (${counts.include})`
                          : option === "Flag"
                            ? `Flagged (${counts.flag})`
                            : `Not business (${counts.exclude})`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 p-2.5 sm:p-4">
                {visibleRows.length === 0 ? (
                  <div className="rounded-[18px] border border-border bg-page px-4 py-10 text-center">
                    <h3 className="text-[17px] font-medium text-text-primary">Nothing here</h3>
                    <p className="mx-auto mt-2 max-w-sm text-[14px] text-text-secondary">
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
                      userId={user.id}
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

            {/* Import */}
            <section className="space-y-4 rounded-[20px] border border-border bg-surface p-4 shadow-card">
              <FieldShell label="Paid with">
                <div className="grid min-h-11 grid-cols-3 rounded-2xl border border-border bg-subtle p-1">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method}
                      className={cn(
                        "focus-ring rounded-xl text-[13px] font-medium transition duration-150 ease-out sm:text-[14px]",
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
                  {blocked} transaction{blocked === 1 ? " is" : "s are"} missing a category, amount,
                  or merchant. Open {blocked === 1 ? "it" : "them"} to finish before importing.
                </p>
              ) : null}

              {counts.flag > 0 ? (
                <p className="text-[13px] text-text-secondary">
                  {counts.flag} flagged transaction{counts.flag === 1 ? "" : "s"} will stay here until
                  you decide. Importing now leaves them untouched.
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
                      : `Import ${pendingRows.length} transaction${
                          pendingRows.length === 1 ? "" : "s"
                        }`}
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  variant="ghost"
                  type="button"
                  onClick={() => setConfirmingDiscard(true)}
                >
                  Discard import
                </Button>
              </div>
            </section>
          </>
        )}
      </div>

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

      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}

function StatusChip({ status }: { status: StatementImport["status"] }) {
  const tone =
    status === "Imported"
      ? "bg-success-soft text-success"
      : status === "Failed"
        ? "bg-danger-soft text-danger"
        : status === "Parsing"
          ? "bg-accent-soft text-accent"
          : "bg-warning-soft text-warning";

  const label = status === "Review" ? "Needs review" : status;

  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
        tone
      )}
    >
      {label}
    </span>
  );
}

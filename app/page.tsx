"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, Plus, Receipt as ReceiptIcon, Tag, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CategoryTag } from "@/components/CategoryTag";
import { SectionTabs } from "@/components/SectionTabs";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { AddTransactionDialog } from "@/components/expenses/AddTransactionDialog";
import { BulkAction, BulkBar } from "@/components/expenses/BulkBar";
import { CategoryPicker } from "@/components/expenses/CategoryPicker";
import { DriveArchiveAlert } from "@/components/expenses/DriveArchiveAlert";
import { ExpenseSlideOver } from "@/components/expenses/ExpenseSlideOver";
import { MonthPicker } from "@/components/expenses/MonthPicker";
import { ProofBadge } from "@/components/expenses/ProofBadge";
import { ProofSheetReview } from "@/components/expenses/ProofSheetReview";
import { QuickReceiptButton } from "@/components/expenses/QuickReceiptButton";
import { StatementReview } from "@/components/expenses/StatementReview";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { authedFetch } from "@/lib/apiClient";
import { cn } from "@/lib/cn";
import { deleteExpenses } from "@/lib/expenseDelete";
import {
  expenseTotal,
  periodMonthBounds,
  periodMonthOf,
  previousPeriodMonth,
  proofState,
  shiftPeriodMonth
} from "@/lib/expenses";
import { formatCurrency, formatShortDate } from "@/lib/formatters";
import { SimilarCategoryDialog } from "@/components/expenses/SimilarCategoryDialog";
import { scanProofSheet } from "@/lib/proofSheetClient";
import { loadImports, scanStatement } from "@/lib/statementImportClient";
import { similarCandidates } from "@/lib/statementImports";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { Expense, Receipt } from "@/types/expense";
import type { ProofSheetScan } from "@/types/proofSheet";
import type { StatementImport } from "@/types/statementImport";

/**
 * Transactions — one page for everything that puts an expense in the books.
 *
 * Typing one out and reading a hundred off a statement were two separate tabs
 * over the same month's data, which made the user pick a route before they had
 * a reason to care. There is one Add button now; the route is chosen inside it.
 */
export default function TransactionsPage() {
  const { user, isAdmin, authLoading } = useAuthUser();
  // Yana files in arrears, so the month that just ended is the useful default.
  const [periodMonth, setPeriodMonth] = useState(() => previousPeriodMonth());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});
  const [pendingDriveCount, setPendingDriveCount] = useState(0);
  const [olderMissingCount, setOlderMissingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [toast, setToast] = useState("");

  // Selection drives bulk edits; `categorising` holds the ids the picker will
  // apply to — one row from its chip, or everything ticked.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [categorising, setCategorising] = useState<string[] | null>(null);
  const [similarPrompt, setSimilarPrompt] = useState<{
    category: string;
    rows: Expense[];
  } | null>(null);
  // Deleting is the one bulk action that cannot be undone, so it goes through a
  // confirmation that says exactly how many rows and how much money is leaving.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Statement import lives on this page now, as a mode rather than a route.
  const [imports, setImports] = useState<StatementImport[]>([]);
  const [ownerLabels, setOwnerLabels] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  // A vendor report waiting to be confirmed. Held in memory, not in the
  // database: nothing about it is worth keeping unless the user goes through
  // with attaching it.
  const [proofSheet, setProofSheet] = useState<{ file: File; scan: ProofSheetScan } | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3500);
  }, []);

  const loadMonth = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);

    const { start, end } = periodMonthBounds(periodMonth);

    let expenseQuery = supabase
      .from("expenses")
      .select("*")
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false });

    let pendingQuery = supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .is("drive_file_id", null)
      .not("storage_path", "is", null);

    let olderQuery = supabase
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .lt("date", start)
      .is("receipt_id", null)
      .eq("proof_waived", false);

    if (!isAdmin) {
      expenseQuery = expenseQuery.eq("user_id", user.id);
      pendingQuery = pendingQuery.eq("user_id", user.id);
      olderQuery = olderQuery.eq("user_id", user.id);
    }

    const [expenseResult, pendingResult, olderResult] = await Promise.all([
      expenseQuery,
      pendingQuery,
      olderQuery
    ]);

    if (expenseResult.error) {
      setLoadError(
        "Expenses tables are not ready yet. Run supabase/expenses-schema.sql in Supabase."
      );
      setExpenses([]);
      setLoading(false);
      return;
    }

    const rows = (expenseResult.data ?? []) as Expense[];
    setExpenses(rows);
    setPendingDriveCount(pendingResult.count ?? 0);
    setOlderMissingCount(olderResult.count ?? 0);
    setLoadError("");

    const receiptIds = Array.from(
      new Set(rows.map((row) => row.receipt_id).filter(Boolean))
    ) as string[];

    if (receiptIds.length > 0) {
      const { data: receiptRows } = await supabase.from("receipts").select("*").in("id", receiptIds);
      const byId: Record<string, Receipt> = {};
      ((receiptRows ?? []) as Receipt[]).forEach((row) => {
        byId[row.id] = row;
      });
      setReceipts(byId);
    } else {
      setReceipts({});
    }

    setLoading(false);
  }, [isAdmin, periodMonth, user]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const refreshImports = useCallback(async () => {
    if (!user) return;
    try {
      const list = await loadImports(user.id, isAdmin);
      setImports(list);

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
      // The import tables may not be migrated yet. Typing transactions in still
      // works, so this stays quiet until the user actually reaches for import.
      setImports([]);
    }
  }, [isAdmin, user]);

  useEffect(() => {
    refreshImports();
  }, [refreshImports]);

  // Surface the outcome of the Google OAuth redirect.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const drive = params.get("drive");
    if (!drive) return;

    showToast(drive === "connected" ? "Google Drive connected" : params.get("message") || "Drive error");
    window.history.replaceState({}, "", window.location.pathname);
  }, [showToast]);

  const stats = useMemo(() => {
    const missing = expenses.filter((expense) => proofState(expense) === "Missing");
    return {
      total: expenseTotal(expenses),
      count: expenses.length,
      missingCount: missing.length
    };
  }, [expenses]);

  const visibleExpenses = useMemo(
    () => (onlyMissing ? expenses.filter((expense) => proofState(expense) === "Missing") : expenses),
    [expenses, onlyMissing]
  );

  const allVisibleSelected =
    visibleExpenses.length > 0 && visibleExpenses.every((expense) => selectedIds.has(expense.id));

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleExpenses.forEach((expense) => next.delete(expense.id));
      else visibleExpenses.forEach((expense) => next.add(expense.id));
      return next;
    });
  }

  function toggleOne(id: string, isSelected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Recategorise one row or a whole selection, in a single write. */
  async function applyCategory(category: string) {
    const ids = categorising ?? [];
    setCategorising(null);
    if (!supabase || ids.length === 0) return;

    // Captured before the write, so the offer below compares against the
    // categories these rows had rather than the one just applied.
    const targets = expenses.filter((expense) => ids.includes(expense.id));

    setExpenses((current) =>
      current.map((expense) => (ids.includes(expense.id) ? { ...expense, category } : expense))
    );
    setSelectedIds(new Set());

    const { error } = await supabase.from("expenses").update({ category }).in("id", ids);
    if (error) {
      showToast("That change did not save.");
      loadMonth();
      return;
    }
    showToast(`${ids.length} transaction${ids.length === 1 ? "" : "s"} set to ${category}`);

    // Same offer the import review makes: this month's other rows from the same
    // payee are almost always the same category, and re-picking each one by hand
    // is the tedious half of tidying up a month.
    const candidates = similarCandidates(targets, expenses, category);
    if (candidates.length > 0) setSimilarPrompt({ category, rows: candidates });
  }

  /**
   * Folds a quick-attached receipt into the page state.
   *
   * Deliberately not a `loadMonth()`: that flips the page back to its loading
   * state and flashes a skeleton over the whole list, which is a poor trade for
   * a one-field change when you are working through a stack of receipts. The
   * write already succeeded, so the row is updated in place. The Drive pending
   * count is the one thing left slightly behind, and it refreshes on the next
   * natural load.
   */
  function attachReceipt(expenseId: string, receipt: Receipt) {
    setReceipts((current) => ({ ...current, [receipt.id]: receipt }));
    setExpenses((current) =>
      current.map((expense) =>
        expense.id === expenseId
          ? { ...expense, receipt_id: receipt.id, proof_waived: false, proof_note: null }
          : expense
      )
    );
    showToast("Receipt attached");
  }

  async function applySimilarCategory(ids: string[]) {
    const category = similarPrompt?.category;
    setSimilarPrompt(null);
    if (!supabase || !category || ids.length === 0) return;

    setExpenses((current) =>
      current.map((expense) => (ids.includes(expense.id) ? { ...expense, category } : expense))
    );

    const { error } = await supabase.from("expenses").update({ category }).in("id", ids);
    if (error) {
      showToast("That change did not save.");
      loadMonth();
      return;
    }
    showToast(`${ids.length} more transaction${ids.length === 1 ? "" : "s"} set to ${category}`);
  }

  /** Remove the ticked rows, and retire any receipts they were holding. */
  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setDeleting(true);
    setDeleteError("");
    try {
      const receiptIds = expenses
        .filter((expense) => selectedIds.has(expense.id))
        .map((expense) => expense.receipt_id)
        .filter(Boolean) as string[];

      await deleteExpenses(ids, receiptIds);
      setSelectedIds(new Set());
      setConfirmingDelete(false);
      await loadMonth();
      showToast(`${ids.length} transaction${ids.length === 1 ? "" : "s"} deleted`);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Those transactions could not be deleted."
      );
    } finally {
      setDeleting(false);
    }
  }

  const selectedTotal = useMemo(
    () => expenseTotal(expenses.filter((expense) => selectedIds.has(expense.id))),
    [expenses, selectedIds]
  );

  const selectedWithProof = useMemo(
    () =>
      expenses.filter((expense) => selectedIds.has(expense.id) && expense.receipt_id !== null)
        .length,
    [expenses, selectedIds]
  );

  const unfinishedImports = useMemo(
    () => imports.filter((item) => item.status === "Review" || item.status === "Parsing"),
    [imports]
  );

  const reviewingOwnerLabel = useMemo(() => {
    const record = imports.find((item) => item.id === reviewingId);
    return record ? ownerLabels[record.user_id] : undefined;
  }, [imports, ownerLabels, reviewingId]);

  async function handleScan(file: File) {
    setScanning(true);
    setScanError("");
    try {
      const { importId } = await scanStatement(file);
      await refreshImports();
      setAddOpen(false);
      setReviewingId(importId);
      showToast("Statement scanned — go through the list");
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "The statement could not be scanned.");
    } finally {
      setScanning(false);
    }
  }

  /**
   * Scans a vendor report and opens its matches for review.
   *
   * The file itself is kept in state rather than uploaded now — a report the
   * user backs out of should leave nothing behind in Storage or Drive.
   */
  async function handleProofSheet(file: File) {
    setScanning(true);
    setScanError("");
    try {
      const scan = await scanProofSheet(file);
      setAddOpen(false);
      setProofSheet({ file, scan });
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "That report could not be scanned.");
    } finally {
      setScanning(false);
    }
  }

  function openManual() {
    setAddOpen(false);
    setEditing(null);
    setFormOpen(true);
  }

  function openExpense(expense: Expense) {
    setEditing(expense);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      <div className="space-y-3">
        <SectionTabs />

        {proofSheet ? (
          <ProofSheetReview
            file={proofSheet.file}
            scan={proofSheet.scan}
            userId={user.id}
            onBack={() => setProofSheet(null)}
            onAttached={({ count, periodDate }) => {
              setProofSheet(null);
              showToast(
                `Report attached to ${count} transaction${count === 1 ? "" : "s"}`
              );
              // Land on the month those transactions are in, or the proof looks
              // like it went nowhere. Changing the month reloads on its own.
              const landing = periodMonthOf(periodDate);
              if (landing !== periodMonth) setPeriodMonth(landing);
              else loadMonth();
            }}
            showToast={showToast}
          />
        ) : reviewingId ? (
          <StatementReview
            importId={reviewingId}
            userId={user.id}
            ownerLabel={isAdmin ? reviewingOwnerLabel : undefined}
            onBack={() => setReviewingId(null)}
            onImported={(outcome) => {
              refreshImports();
              // Land on the month the rows actually filed under, or the books
              // read as empty and the import looks like it did nothing.
              // Changing the month reloads on its own; only reload when it does not.
              if (outcome.periodMonth && outcome.periodMonth !== periodMonth) {
                setPeriodMonth(outcome.periodMonth);
              } else {
                loadMonth();
              }
              // Flagged rows are the only reason to keep this screen open.
              if (outcome.complete) setReviewingId(null);
            }}
            onDiscarded={() => {
              setReviewingId(null);
              refreshImports();
              showToast("Import discarded");
            }}
            showToast={showToast}
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 sm:max-w-[280px]">
                <MonthPicker periodMonth={periodMonth} onChange={setPeriodMonth} />
              </div>
              <button
                className="focus-ring inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 text-[15px] font-medium text-text-primary transition hover:bg-[#BE9E62]"
                type="button"
                onClick={() => {
                  setScanError("");
                  setAddOpen(true);
                }}
              >
                <Plus size={18} strokeWidth={2} />
                Add
              </button>
            </div>

            <DriveArchiveAlert pendingCount={pendingDriveCount} onSynced={loadMonth} />

            {unfinishedImports.length > 0 ? (
              <button
                className="focus-ring flex w-full items-center gap-2.5 rounded-xl border border-accent/35 bg-accent-soft px-3 py-2 text-left text-[13px] text-text-primary transition hover:brightness-[0.98]"
                type="button"
                onClick={() => setReviewingId(unfinishedImports[0].id)}
              >
                <ReceiptIcon size={15} strokeWidth={1.8} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  {unfinishedImports.length} scanned statement
                  {unfinishedImports.length === 1 ? "" : "s"} still waiting to be reviewed.
                </span>
                <span className="shrink-0 font-medium">Review</span>
              </button>
            ) : null}

            {loadError ? (
              <section className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-2.5">
                <p className="text-[13px] text-text-secondary">{loadError}</p>
              </section>
            ) : null}

            {!loadError && olderMissingCount > 0 ? (
              <button
                className="focus-ring flex w-full items-center gap-2.5 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-left transition hover:brightness-[0.98]"
                type="button"
                onClick={() => setPeriodMonth((current) => shiftPeriodMonth(current, -1))}
              >
                <CircleAlert size={15} strokeWidth={1.8} className="shrink-0 text-danger" />
                <span className="min-w-0 flex-1 text-[13px] text-danger">
                  {olderMissingCount} transaction{olderMissingCount === 1 ? "" : "s"} in earlier
                  months still {olderMissingCount === 1 ? "has" : "have"} no proof.
                </span>
              </button>
            ) : null}

            <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
              {/* The month's numbers are the list's header, not three cards above it. */}
              <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
                <StatCell label="Total" value={formatCurrency(stats.total)} />
                <StatCell label="Transactions" value={String(stats.count)} />
                <StatCell
                  label="No proof"
                  value={String(stats.missingCount)}
                  tone={stats.missingCount > 0 ? "danger" : "success"}
                  // Filtering to what is missing is the only thing this number is
                  // ever used for, so the number is the control.
                  active={onlyMissing}
                  onClick={
                    stats.missingCount > 0
                      ? () => setOnlyMissing((current) => !current)
                      : undefined
                  }
                />
              </div>

              <div className="p-2.5 sm:p-3">
                {loading ? <SkeletonRows /> : null}

                {!loading && !loadError && visibleExpenses.length === 0 ? (
                  <div className="rounded-[16px] border border-border bg-page px-4 py-9 text-center">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-[16px] bg-accent-soft">
                      <ReceiptIcon size={21} strokeWidth={1.5} className="text-accent" />
                    </div>
                    <h3 className="mt-3 text-[16px] font-medium text-text-primary">
                      {onlyMissing ? "Everything has proof" : "Nothing logged this month"}
                    </h3>
                    <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-snug text-text-secondary">
                      {onlyMissing
                        ? "Every transaction this month has a receipt or an explicit waiver."
                        : "Type a transaction in, or upload the month's statement and keep the business ones."}
                    </p>
                    {!onlyMissing ? (
                      <button
                        className="focus-ring mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-[14px] font-medium text-text-primary transition hover:bg-[#BE9E62]"
                        type="button"
                        onClick={() => {
                          setScanError("");
                          setAddOpen(true);
                        }}
                      >
                        <Plus size={17} strokeWidth={2} />
                        Add transactions
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {!loading && visibleExpenses.length > 0 ? (
                  <>
                    <label className="mb-1.5 flex w-fit cursor-pointer items-center gap-2 px-2 text-[12px] text-text-secondary">
                      <input
                        className="h-4 w-4 cursor-pointer accent-[#C9A96E]"
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                      />
                      {allVisibleSelected ? "Clear" : `Select all ${visibleExpenses.length}`}
                    </label>
                    <div className="space-y-1.5">
                      {visibleExpenses.map((expense) => (
                        <ExpenseRow
                          key={expense.id}
                          expense={expense}
                          userId={user.id}
                          selected={selectedIds.has(expense.id)}
                          onSelect={(isSelected) => toggleOne(expense.id, isSelected)}
                          onOpen={() => openExpense(expense)}
                          onCategory={() => setCategorising([expense.id])}
                          onAttached={(receipt) => attachReceipt(expense.id, receipt)}
                          onAttachError={showToast}
                        />
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </section>
          </>
        )}
      </div>

      {!reviewingId ? (
        <BulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
          <BulkAction
            icon={Tag}
            label="Set category"
            onClick={() => setCategorising(Array.from(selectedIds))}
          />
          <BulkAction
            icon={Trash2}
            label="Delete"
            tone="danger"
            onClick={() => {
              setDeleteError("");
              setConfirmingDelete(true);
            }}
          />
        </BulkBar>
      ) : null}

      {categorising ? (
        <CategoryPicker
          title={
            categorising.length === 1
              ? "Choose a category"
              : `Category for ${categorising.length} transactions`
          }
          current={
            categorising.length === 1
              ? expenses.find((expense) => expense.id === categorising[0])?.category
              : undefined
          }
          onPick={applyCategory}
          onClose={() => setCategorising(null)}
        />
      ) : null}

      {similarPrompt ? (
        <SimilarCategoryDialog
          category={similarPrompt.category}
          rows={similarPrompt.rows}
          onApply={applySimilarCategory}
          onDismiss={() => setSimilarPrompt(null)}
        />
      ) : null}

      {addOpen ? (
        <AddTransactionDialog
          unfinished={unfinishedImports}
          scanning={scanning}
          scanError={scanError}
          onManual={openManual}
          onFile={handleScan}
          onProofSheet={handleProofSheet}
          onResume={(importId) => {
            setAddOpen(false);
            setReviewingId(importId);
          }}
          onClose={() => setAddOpen(false)}
        />
      ) : null}

      {formOpen ? (
        <ExpenseSlideOver
          expense={editing ?? undefined}
          receipt={editing?.receipt_id ? receipts[editing.receipt_id] ?? null : null}
          userId={user.id}
          defaultDate={periodMonthBounds(periodMonth).end}
          onClose={closeForm}
          onSaved={() => {
            closeForm();
            loadMonth();
            showToast(editing ? "Transaction updated" : "Transaction added");
          }}
          onDeleted={() => {
            closeForm();
            loadMonth();
            showToast("Transaction deleted");
          }}
        />
      ) : null}

      {confirmingDelete ? (
        <ConfirmDialog
          title={`Delete ${selectedIds.size} transaction${selectedIds.size === 1 ? "" : "s"}?`}
          description={`${formatCurrency(selectedTotal)} will be permanently removed from your records${
            selectedWithProof > 0
              ? `, and ${selectedWithProof} attached receipt${
                  selectedWithProof === 1 ? "" : "s"
                } will move to your Drive trash, where they stay recoverable for 30 days`
              : ""
          }. This cannot be undone.`}
          confirmLabel={`Delete ${selectedIds.size}`}
          cancelLabel="Keep them"
          busy={deleting}
          error={deleteError}
          onConfirm={deleteSelected}
          onCancel={() => {
            setDeleteError("");
            setConfirmingDelete(false);
          }}
        />
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}

function StatCell({
  label,
  value,
  tone = "neutral",
  active = false,
  onClick
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger" | "success";
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 truncate text-[17px] font-medium leading-tight sm:text-[19px]",
          tone === "danger" ? "text-danger" : "text-text-primary"
        )}
      >
        {value}
      </div>
    </>
  );

  if (!onClick) return <div className="px-3 py-2.5">{content}</div>;

  return (
    <button
      className={cn(
        "focus-ring px-3 py-2.5 text-left transition hover:bg-subtle",
        active && "bg-danger-soft"
      )}
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      {content}
      <span className="mt-0.5 block text-[11px] font-medium text-danger">
        {active ? "Showing these" : "Show these"}
      </span>
    </button>
  );
}

function ExpenseRow({
  expense,
  userId,
  selected,
  onSelect,
  onOpen,
  onCategory,
  onAttached,
  onAttachError
}: {
  expense: Expense;
  userId: string;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onOpen: () => void;
  onCategory: () => void;
  onAttached: (receipt: Receipt) => void;
  onAttachError: (message: string) => void;
}) {
  const state = proofState(expense);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl px-2 transition",
        selected ? "bg-accent-soft/70" : "bg-subtle hover:bg-border"
      )}
    >
      <input
        className="h-4 w-4 shrink-0 cursor-pointer accent-[#C9A96E]"
        type="checkbox"
        checked={selected}
        aria-label={`Select ${expense.merchant}`}
        onChange={(event) => onSelect(event.target.checked)}
      />

      <button
        className="focus-ring flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left"
        type="button"
        onClick={onOpen}
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[14.5px] font-medium text-text-primary">
              {expense.merchant}
            </span>
            {state !== "Attached" ? <ProofBadge state={state} /> : null}
          </span>
          <span className="mt-0.5 block text-[12px] text-text-tertiary">
            {formatShortDate(expense.date)}
          </span>
        </span>

        {/* Fixed width, right aligned: an amount column that sizes to its own
            digits drags everything beside it around from row to row. */}
        <span className="w-[92px] shrink-0 text-right">
          <span className="block text-[14.5px] font-medium tabular-nums text-text-primary">
            {formatCurrency(expense.amount)}
          </span>
          {state === "Attached" ? (
            <span className="block text-[11px] font-medium text-success">Proof</span>
          ) : null}
        </span>
      </button>

      {/* Only where there is nothing yet. A row that already has proof, or was
          deliberately waived, is not a row you are hunting a receipt for. */}
      {state === "Missing" ? (
        <QuickReceiptButton
          expense={expense}
          userId={userId}
          onAttached={onAttached}
          onError={onAttachError}
        />
      ) : null}

      <button
        className="focus-ring hidden w-[116px] shrink-0 items-center rounded-md transition hover:brightness-[0.97] sm:flex"
        type="button"
        aria-label={`Category: ${expense.category}. Change it`}
        onClick={onCategory}
      >
        <CategoryTag category={expense.category} fixedWidth />
      </button>
    </div>
  );
}

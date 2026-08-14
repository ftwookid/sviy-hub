"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Plus,
  Receipt as ReceiptIcon,
  Wallet
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CategoryTag } from "@/components/CategoryTag";
import { ExpenseSectionTabs } from "@/components/ExpenseSectionTabs";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { DriveArchiveCard } from "@/components/expenses/DriveArchiveCard";
import { ExpenseSlideOver } from "@/components/expenses/ExpenseSlideOver";
import { ProofBadge } from "@/components/expenses/ProofBadge";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import {
  currentPeriodMonth,
  expenseTotal,
  periodMonthBounds,
  periodMonthLabel,
  previousPeriodMonth,
  proofState,
  shiftPeriodMonth
} from "@/lib/expenses";
import { formatCurrency, formatShortDate } from "@/lib/formatters";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { Expense, Receipt } from "@/types/expense";

export default function ExpensesPage() {
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

  // Surface the outcome of the Google OAuth redirect.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const drive = params.get("drive");
    if (!drive) return;

    showToast(drive === "connected" ? "Google Drive connected" : params.get("message") || "Drive error");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }

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

  function openNew() {
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

  const isCurrentMonth = periodMonth === currentPeriodMonth();

  return (
    <AppShell user={user}>
      <div className="space-y-5">
        <div>
          <h1 className="text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-text-primary sm:text-[34px]">
            Expenses
          </h1>
          <p className="mt-2 text-[15px] text-text-secondary sm:text-[16px]">
            Log business transactions and keep proof for tax time.
          </p>
        </div>

        <ExpenseSectionTabs />

        {/* Month navigation */}
        <div className="flex items-center justify-between gap-2 rounded-[20px] border border-border bg-surface p-2 shadow-card">
          <Button
            className="h-11 w-11 shrink-0 px-0"
            variant="soft"
            aria-label="Previous month"
            onClick={() => setPeriodMonth((current) => shiftPeriodMonth(current, -1))}
          >
            <ChevronLeft size={18} strokeWidth={1.7} />
          </Button>
          <div className="min-w-0 text-center">
            <div className="truncate text-[16px] font-medium text-text-primary">
              {periodMonthLabel(periodMonth)}
            </div>
            {!isCurrentMonth ? (
              <button
                className="focus-ring rounded-md text-[12px] text-text-tertiary underline-offset-2 hover:underline"
                type="button"
                onClick={() => setPeriodMonth(currentPeriodMonth())}
              >
                Jump to this month
              </button>
            ) : (
              <div className="text-[12px] text-text-tertiary">Current month</div>
            )}
          </div>
          <Button
            className="h-11 w-11 shrink-0 px-0"
            variant="soft"
            aria-label="Next month"
            onClick={() => setPeriodMonth((current) => shiftPeriodMonth(current, 1))}
          >
            <ChevronRight size={18} strokeWidth={1.7} />
          </Button>
        </div>

        {/* Month summary */}
        <section className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <StatTile
            icon={Wallet}
            label="Total"
            value={formatCurrency(stats.total)}
            tone="neutral"
          />
          <StatTile
            icon={ReceiptIcon}
            label="Transactions"
            value={String(stats.count)}
            tone="neutral"
          />
          <StatTile
            icon={CircleAlert}
            label="No proof"
            value={String(stats.missingCount)}
            tone={stats.missingCount > 0 ? "danger" : "success"}
          />
        </section>

        {loadError ? (
          <section className="rounded-[20px] border border-warning/30 bg-warning-soft px-4 py-5">
            <h3 className="text-[17px] font-medium text-text-primary">Expenses needs database setup</h3>
            <p className="mt-2 text-[14px] text-text-secondary">{loadError}</p>
          </section>
        ) : null}

        {!loadError && olderMissingCount > 0 ? (
          <button
            className="focus-ring flex w-full items-center gap-3 rounded-[20px] border border-danger/25 bg-danger-soft px-4 py-3 text-left transition hover:brightness-[0.98]"
            type="button"
            onClick={() => setPeriodMonth((current) => shiftPeriodMonth(current, -1))}
          >
            <CircleAlert size={18} strokeWidth={1.8} className="shrink-0 text-danger" />
            <span className="text-[13px] text-danger">
              {olderMissingCount} transaction{olderMissingCount === 1 ? "" : "s"} in earlier months
              still {olderMissingCount === 1 ? "has" : "have"} no proof attached.
            </span>
          </button>
        ) : null}

        <DriveArchiveCard pendingCount={pendingDriveCount} />

        {/* Transactions */}
        <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card sm:rounded-[24px]">
          <div className="flex flex-col gap-3 border-b border-border p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="min-w-0">
              <h2 className="text-[19px] font-medium text-text-primary sm:text-[22px]">Transactions</h2>
              <p className="mt-1 text-[13px] text-text-secondary sm:text-[14px]">
                {periodMonthLabel(periodMonth)}
              </p>
            </div>
            <div className="flex gap-2">
              {stats.missingCount > 0 ? (
                <Button
                  className={cn("flex-1 sm:flex-none", onlyMissing && "bg-danger-soft text-danger")}
                  variant="soft"
                  onClick={() => setOnlyMissing((current) => !current)}
                >
                  {onlyMissing ? "Show all" : `Missing (${stats.missingCount})`}
                </Button>
              ) : null}
              <Button className="flex-1 sm:flex-none" variant="accent" onClick={openNew}>
                <Plus size={18} strokeWidth={1.6} />
                Add
              </Button>
            </div>
          </div>

          <div className="p-2.5 sm:p-4">
            {loading ? <SkeletonRows /> : null}

            {!loading && !loadError && visibleExpenses.length === 0 ? (
              <div className="rounded-[18px] border border-border bg-page px-4 py-10 text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] bg-accent-soft">
                  <ReceiptIcon size={24} strokeWidth={1.5} className="text-accent" />
                </div>
                <h3 className="mt-4 text-[18px] font-medium text-text-primary">
                  {onlyMissing ? "Everything has proof" : "Nothing logged this month"}
                </h3>
                <p className="mx-auto mt-2 max-w-sm text-[14px] text-text-secondary">
                  {onlyMissing
                    ? "Every transaction in this month has a receipt or an explicit waiver."
                    : "Add the transactions for this month, then attach the receipts."}
                </p>
                {!onlyMissing ? (
                  <Button className="mt-5 w-full sm:w-auto" variant="accent" onClick={openNew}>
                    <Plus size={18} strokeWidth={1.6} />
                    Add transaction
                  </Button>
                ) : null}
              </div>
            ) : null}

            {!loading && visibleExpenses.length > 0 ? (
              <div className="space-y-2">
                {visibleExpenses.map((expense) => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    onOpen={() => openExpense(expense)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </div>

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

      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone: "neutral" | "danger" | "success";
}) {
  return (
    <div className="min-h-[96px] rounded-[18px] border border-border bg-surface p-3 shadow-card">
      <span
        className={cn(
          "grid h-8 w-8 place-items-center rounded-[12px]",
          tone === "danger" && "bg-danger-soft text-danger",
          tone === "success" && "bg-success-soft text-success",
          tone === "neutral" && "bg-accent-soft text-accent"
        )}
      >
        <Icon size={16} strokeWidth={1.7} />
      </span>
      <div className="mt-2.5 text-[10px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 truncate text-[18px] font-medium leading-none text-text-primary sm:text-[21px]">
        {value}
      </div>
    </div>
  );
}

function ExpenseRow({ expense, onOpen }: { expense: Expense; onOpen: () => void }) {
  const state = proofState(expense);

  return (
    <button
      className="focus-ring flex w-full items-center justify-between gap-3 rounded-2xl bg-subtle px-3 py-3 text-left transition hover:bg-border"
      type="button"
      onClick={onOpen}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-medium text-text-primary">{expense.merchant}</span>
          {state !== "Attached" ? <ProofBadge state={state} /> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-tertiary">
          <span>{formatShortDate(expense.date)}</span>
          <span aria-hidden>·</span>
          <CategoryTag category={expense.category} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[15px] font-medium tabular-nums text-text-primary">
          {formatCurrency(expense.amount)}
        </div>
        {state === "Attached" ? (
          <div className="mt-0.5 text-[11px] font-medium text-success">Proof</div>
        ) : null}
      </div>
    </button>
  );
}

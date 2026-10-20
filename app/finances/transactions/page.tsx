"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TransactionsPanel } from "@/components/finances/TransactionsPanel";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { loadBankTransactions, updateBankTransaction } from "@/lib/bankTransactions";
import { currentPeriodMonth } from "@/lib/expenses";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { BankCategory, BankProject, BankTransaction } from "@/types/bankTransaction";

/**
 * Posted bank and card transactions for one month.
 *
 * A route under Finances, the same way Manage is: the month stays the page you
 * land on, and this is where the feed is read. The table may not exist yet —
 * the migration is applied by hand — and that is a notice, not a broken page.
 */

export default function BankTransactionsPage() {
  const { user, authLoading } = useAuthUser();
  const [periodMonth, setPeriodMonth] = useState(() => currentPeriodMonth());
  const [rows, setRows] = useState<BankTransaction[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const loadMonth = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const result = await loadBankTransactions(periodMonth);
      setRows(result.rows);
      setNotice(result.setupNeeded ? result.setupMessage : "");
    } catch (error) {
      setRows([]);
      setNotice(error instanceof Error ? error.message : "Could not load transactions");
    }
    setLoading(false);
  }, [periodMonth, user]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function change(
    row: BankTransaction,
    patch: { category?: BankCategory; project?: BankProject },
    saved: string
  ) {
    const previous = rows;
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, ...patch } : item)));
    try {
      await updateBankTransaction(row.id, patch);
      setToast(saved);
    } catch (error) {
      setRows(previous);
      setToast(error instanceof Error ? error.message : "That change did not save.");
    }
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      <header className="mb-4 flex min-h-11 items-center gap-1">
        <Link
          href="/finances"
          aria-label="Back to Finances"
          className="focus-ring -my-1.5 -ml-3 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-text-secondary transition-colors duration-200 ease-out hover:bg-subtle hover:text-text-primary"
        >
          <ChevronLeft size={20} strokeWidth={1.8} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-figure-lg font-semibold leading-none tracking-[-0.01em] text-text-primary sm:text-display-sm">
          Transactions
        </h1>
      </header>

      <div className="space-y-3">
        {notice ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-warning/35 bg-warning-soft px-3.5 py-3 text-list text-text-primary">
            <AlertTriangle size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-warning" />
            <span>{notice}</span>
          </div>
        ) : null}

        {loading ? (
          <SkeletonRows />
        ) : notice ? null : (
          <TransactionsPanel
            periodMonth={periodMonth}
            onPeriodMonth={setPeriodMonth}
            rows={rows}
            onCategory={(row, category) => change(row, { category }, `Category set to ${category}`)}
            onProject={(row, project) => change(row, { project }, `Project set to ${project}`)}
          />
        )}
      </div>

      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}

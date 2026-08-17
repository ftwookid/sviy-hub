"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ExpenseSectionTabs } from "@/components/ExpenseSectionTabs";
import { ReportTable } from "@/components/ReportTable";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { MONTHS } from "@/lib/months";
import { formatCurrency } from "@/lib/formatters";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { Expense } from "@/types/expense";

export default function ReportsPage() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const { user, isAdmin, authLoading } = useAuthUser();
  const [year, setYear] = useState(currentYear);
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);

    let yearQuery = supabase
      .from("expenses")
      .select("*")
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`)
      .order("date", { ascending: true });
    let datesQuery = supabase.from("expenses").select("date");

    if (!isAdmin) {
      yearQuery = yearQuery.eq("user_id", user.id);
      datesQuery = datesQuery.eq("user_id", user.id);
    }

    const [{ data: yearData }, { data: allDates }] = await Promise.all([
      yearQuery,
      datesQuery
    ]);

    const years = Array.from(
      new Set((allDates ?? []).map((row) => Number(String(row.date).slice(0, 4))).filter(Boolean))
    ).sort((a, b) => b - a);

    setAvailableYears(years.length ? years : [currentYear]);
    setExpenses((yearData ?? []) as Expense[]);
    setLoading(false);
  }, [currentYear, isAdmin, user, year]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const monthlyTotals = MONTHS.map((month, index) => {
    const total = expenses
      .filter((expense) => new Date(`${expense.date}T12:00:00`).getMonth() === index)
      .reduce((sum, expense) => sum + Number(expense.amount), 0);
    return { month, total };
  });
  const maxMonthTotal = Math.max(...monthlyTotals.map((row) => row.total), 1);

  function exportCsv() {
    const headers = ["Date", "Merchant", "Description", "Category", "Payment Method", "Amount", "Notes"];
    const rows = expenses.map((expense) => [
      expense.date,
      expense.merchant,
      expense.description ?? "",
      expense.category,
      expense.payment_method,
      Number(expense.amount).toFixed(2),
      expense.notes ?? ""
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sviy-hub-expenses-${year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[22px] font-medium leading-tight tracking-[-0.01em] text-text-primary sm:text-[26px]">
            Expenses
          </h1>
          <ExpenseSectionTabs />
        </div>

        {/* Year and export are one control row — the same shape as the month
            row on the transactions page. */}
        <div className="flex items-center gap-2">
          <select
            className="focus-ring h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-[15px] font-medium text-text-primary shadow-sm sm:max-w-[160px]"
            aria-label="Year"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {availableYears.map((availableYear) => (
              <option key={availableYear} value={availableYear}>
                {availableYear}
              </option>
            ))}
          </select>
          <Button
            className="shrink-0"
            variant="soft"
            onClick={exportCsv}
            disabled={expenses.length === 0}
          >
            <Download size={16} strokeWidth={1.7} />
            Export CSV
          </Button>
        </div>

        {loading ? (
          <SkeletonRows />
        ) : (
          <>
            <ReportTable expenses={expenses} />
            <section className="rounded-[20px] border border-border bg-surface p-3.5 shadow-card">
              <h2 className="text-[15px] font-medium leading-tight text-text-primary">
                Monthly breakdown
              </h2>
              <div className="mt-3 space-y-2">
                {monthlyTotals.map((row) => (
                  <div key={row.month} className="grid grid-cols-[72px_1fr_92px] items-center gap-3">
                    <div className="text-[12px] text-text-secondary">{row.month.slice(0, 3)}</div>
                    <div className="h-2 overflow-hidden rounded-full bg-subtle">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-200 ease-in-out"
                        style={{ width: `${Math.max(4, (row.total / maxMonthTotal) * 100)}%` }}
                      />
                    </div>
                    <div className="text-right text-[12px] font-medium text-text-primary">
                      {formatCurrency(row.total)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Download } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { ReportTable } from "@/components/ReportTable";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { MONTHS } from "@/lib/months";
import { formatCurrency } from "@/lib/formatters";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Expense } from "@/types/expense";

export default function ReportsPage() {
  const router = useRouter();
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [year, setYear] = useState(currentYear);
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setUser(data.user);
      setAuthLoading(false);
    });
  }, [router]);

  const loadReports = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);

    const [{ data: yearData }, { data: allDates }] = await Promise.all([
      supabase
        .from("expenses")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", `${year}-01-01`)
        .lte("date", `${year}-12-31`)
        .order("date", { ascending: true }),
      supabase.from("expenses").select("date").eq("user_id", user.id)
    ]);

    const years = Array.from(
      new Set((allDates ?? []).map((row) => Number(String(row.date).slice(0, 4))).filter(Boolean))
    ).sort((a, b) => b - a);

    setAvailableYears(years.length ? years : [currentYear]);
    setExpenses((yearData ?? []) as Expense[]);
    setLoading(false);
  }, [currentYear, user, year]);

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
    <>
      <Navigation email={user.email} />
      <main className="mx-auto max-w-[780px] space-y-8 px-4 py-8 sm:px-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-medium leading-[1.3] text-text-primary">Reports</h1>
            <p className="mt-1 text-[13px] text-text-secondary">Schedule C-ready yearly summary.</p>
          </div>
          <Button variant="soft" onClick={exportCsv} disabled={expenses.length === 0}>
            <Download size={16} strokeWidth={1.5} />
            Export CSV
          </Button>
        </div>

        <div className="w-full sm:w-44">
          <Select label="Year" value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {availableYears.map((availableYear) => (
              <option key={availableYear} value={availableYear}>
                {availableYear}
              </option>
            ))}
          </Select>
        </div>

        {loading ? (
          <SkeletonRows />
        ) : (
          <>
            <ReportTable expenses={expenses} />
            <section className="rounded-xl border border-border bg-surface p-5 shadow-card">
              <h2 className="text-[15px] font-medium leading-[1.3] text-text-primary">Monthly breakdown</h2>
              <div className="mt-5 space-y-3">
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
      </main>
    </>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { SectionTabs } from "@/components/SectionTabs";
import { ReportTable } from "@/components/ReportTable";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { MONTHS } from "@/lib/months";
import { dateFromTimestamp, loadMileageTrips, loadMileageUploads } from "@/lib/mileage";
import { formatCurrency } from "@/lib/formatters";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { Expense } from "@/types/expense";

export default function ReportsPage() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const { user, authLoading } = useAuthUser();
  const [year, setYear] = useState(currentYear);
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [mileageByMonth, setMileageByMonth] = useState<number[]>(() => Array(12).fill(0));
  const [mileageMiles, setMileageMiles] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);

    const yearQuery = supabase
      .from("expenses")
      .select("*")
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`)
      .order("date", { ascending: true });
    const datesQuery = supabase.from("expenses").select("date");

    const [{ data: yearData }, { data: allDates }] = await Promise.all([
      yearQuery,
      datesQuery
    ]);

    const years = Array.from(
      new Set((allDates ?? []).map((row) => Number(String(row.date).slice(0, 4))).filter(Boolean))
    ).sort((a, b) => b - a);

    setAvailableYears(years.length ? years : [currentYear]);
    setExpenses((yearData ?? []) as Expense[]);

    // Miles are a deduction too. A year total that leaves them out is not the
    // number this page exists to give.
    const scope = { ownerId: "all" };
    const { uploads } = await loadMileageUploads(scope);
    const { trips } = await loadMileageTrips(
      scope,
      uploads.filter((upload) => upload.is_active).map((upload) => upload.id)
    );
    const months = Array(12).fill(0) as number[];
    let miles = 0;
    trips.forEach((trip) => {
      const date = dateFromTimestamp(trip.start_at);
      if (date.getFullYear() !== year) return;
      months[date.getMonth()] += Number(trip.deduction_value);
      miles += Number(trip.miles);
    });
    setMileageByMonth(months);
    setMileageMiles(miles);
    setLoading(false);
  }, [currentYear, user, year]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const monthlyTotals = MONTHS.map((month, index) => {
    const spent = expenses
      .filter((expense) => new Date(`${expense.date}T12:00:00`).getMonth() === index)
      .reduce((sum, expense) => sum + Number(expense.amount), 0);
    const driven = mileageByMonth[index] ?? 0;
    return { month, spent, driven, total: spent + driven };
  });
  const maxMonthTotal = Math.max(...monthlyTotals.map((row) => row.total), 1);
  const spentTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const mileageTotal = mileageByMonth.reduce((sum, value) => sum + value, 0);

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
      <PageHeader title="Taxes" />
      <div className="space-y-3">
        <SectionTabs />

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
            <section className="rounded-[20px] border border-border bg-[#F5EFE3] p-4 shadow-card">
              <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
                Deductible in {year}
              </div>
              <div className="mt-2.5 text-[30px] font-medium leading-none tracking-[-0.01em] text-text-primary">
                {formatCurrency(spentTotal + mileageTotal)}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-text-secondary">
                <span>{formatCurrency(spentTotal)} spent</span>
                <span>
                  {formatCurrency(mileageTotal)} driven · {mileageMiles.toFixed(0)} mi
                </span>
              </div>
            </section>

            <ReportTable expenses={expenses} />
            <section className="rounded-[20px] border border-border bg-surface p-3.5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-medium leading-tight text-text-primary">Monthly breakdown</h2>
                <div className="flex items-center gap-3 text-[12px] text-text-tertiary">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    Spent
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#D8C7A5]" />
                    Driven
                  </span>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {monthlyTotals.map((row) => (
                  <div key={row.month} className="grid grid-cols-[72px_1fr_92px] items-center gap-3">
                    <div className="text-[12px] text-text-secondary">{row.month.slice(0, 3)}</div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-subtle">
                      <div
                        className="h-full bg-accent transition-all duration-200 ease-in-out"
                        style={{ width: `${(row.spent / maxMonthTotal) * 100}%` }}
                      />
                      <div
                        className="h-full bg-[#D8C7A5] transition-all duration-200 ease-in-out"
                        style={{ width: `${(row.driven / maxMonthTotal) * 100}%` }}
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

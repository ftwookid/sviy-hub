"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ExpenseSectionTabs } from "@/components/ExpenseSectionTabs";
import { ExpenseForm } from "@/components/ExpenseForm";
import { ExpenseList, type ExpenseFilters } from "@/components/ExpenseList";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { daysAgo, formatCurrency, formatMonth, monthRange } from "@/lib/formatters";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { Expense } from "@/types/expense";

export default function DashboardPage() {
  const merchantInputRef = useRef<HTMLInputElement>(null);
  const now = useMemo(() => new Date(), []);
  const { user, authLoading } = useAuthUser();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [yearExpenses, setYearExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [editing, setEditing] = useState<Expense | null>(null);
  const [filters, setFilters] = useState<ExpenseFilters>({
    month: now.getMonth(),
    year: now.getFullYear(),
    category: "",
    paymentMethod: "",
    search: ""
  });

  const loadExpenses = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);

    const selectedRange = monthRange(filters.year, filters.month);
    let query = supabase
      .from("expenses")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", selectedRange.start)
      .lte("date", selectedRange.end)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (filters.category) query = query.eq("category", filters.category);
    if (filters.paymentMethod) query = query.eq("payment_method", filters.paymentMethod);
    if (filters.search.trim()) {
      const search = `%${filters.search.trim()}%`;
      query = query.or(`merchant.ilike.${search},description.ilike.${search}`);
    }

    const currentYear = now.getFullYear();
    const yearStart = `${currentYear}-01-01`;
    const yearEnd = `${currentYear}-12-31`;
    const [{ data: filteredData }, { data: yearData }] = await Promise.all([
      query,
      supabase
        .from("expenses")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", yearStart)
        .lte("date", yearEnd)
    ]);

    setExpenses((filteredData ?? []) as Expense[]);
    setYearExpenses((yearData ?? []) as Expense[]);
    setLoading(false);
  }, [filters, now, user]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";
      if (!isTyping && event.key.toLowerCase() === "n") {
        event.preventDefault();
        merchantInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  function showSavedToast(message = "Expense added") {
    setToast(message);
    loadExpenses();
    window.setTimeout(() => setToast(""), 2500);
  }

  const currentMonthTotal = yearExpenses
    .filter((expense) => {
      const date = new Date(`${expense.date}T12:00:00`);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    })
    .reduce((sum, expense) => sum + Number(expense.amount), 0);

  const yearTotal = yearExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const lastLogged = yearExpenses
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null;

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[34px] font-medium leading-[1.08] tracking-[-0.01em] text-text-primary">Expenses</h1>
            <p className="mt-2 text-[16px] text-text-secondary">Care work spending, softly organized.</p>
          </div>
          <ExpenseSectionTabs />
        </div>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={`This month · ${formatMonth(now)}`} value={formatCurrency(currentMonthTotal)} />
          <StatCard label="This year" value={formatCurrency(yearTotal)} />
          <StatCard label="Transactions" value={String(yearExpenses.length)} />
          <StatCard label="Last logged" value={daysAgo(lastLogged)} />
        </section>

        <section className="space-y-3">
          <ExpenseForm userId={user.id} merchantInputRef={merchantInputRef} onSaved={showSavedToast} />
        </section>

        <ExpenseList
          expenses={expenses}
          loading={loading}
          filters={filters}
          onFiltersChange={setFilters}
          onEdit={setEditing}
          onDeleted={loadExpenses}
        />
      </div>

      {editing ? (
        <div className="fixed inset-0 z-40 bg-black/20">
          <aside className="ml-auto h-full w-full max-w-[460px] overflow-y-auto bg-page p-4 shadow-card sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[20px] font-medium leading-[1.3] text-text-primary">Edit expense</h2>
              <Button variant="ghost" onClick={() => setEditing(null)} aria-label="Close editor">
                <X size={18} strokeWidth={1.5} />
              </Button>
            </div>
            <ExpenseForm
              key={editing.id}
              userId={user.id}
              expense={editing}
              onSaved={() => {
                setEditing(null);
                showSavedToast("Expense saved");
              }}
              onCancel={() => setEditing(null)}
            />
          </aside>
        </div>
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}

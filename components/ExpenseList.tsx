"use client";

import { Receipt, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { ExpenseRow } from "@/components/ExpenseRow";
import { MonthPicker } from "@/components/MonthPicker";
import { CategoryTag } from "@/components/CategoryTag";
import { Select, Input } from "@/components/ui/Field";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { SCHEDULE_C_CATEGORIES } from "@/lib/categories";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import { formatCurrency, formatMonth } from "@/lib/formatters";
import type { Expense } from "@/types/expense";

export type ExpenseFilters = {
  month: number;
  year: number;
  category: string;
  paymentMethod: string;
  search: string;
};

export function ExpenseList({
  expenses,
  loading,
  filters,
  onFiltersChange,
  onEdit,
  onDeleted
}: {
  expenses: Expense[];
  loading: boolean;
  filters: ExpenseFilters;
  onFiltersChange: (filters: ExpenseFilters) => void;
  onEdit: (expense: Expense) => void;
  onDeleted: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  function update(partial: Partial<ExpenseFilters>) {
    onFiltersChange({ ...filters, ...partial });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative sm:w-48">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
            Period
          </div>
          <Button className="w-full justify-between" variant="soft" onClick={() => setPickerOpen((value) => !value)}>
            {formatMonth(new Date(filters.year, filters.month, 1))}
            <SlidersHorizontal size={15} strokeWidth={1.5} />
          </Button>
          {pickerOpen ? (
            <div className="absolute left-0 top-[70px] z-20 w-64">
              <MonthPicker
                month={filters.month}
                year={filters.year}
                onChange={(next) => {
                  update(next);
                  setPickerOpen(false);
                }}
              />
            </div>
          ) : null}
        </div>
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <Select
            label="Category"
            value={filters.category}
            onChange={(event) => update({ category: event.target.value })}
          >
            <option value="">All categories</option>
            {SCHEDULE_C_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
          <Select
            label="Method"
            value={filters.paymentMethod}
            onChange={(event) => update({ paymentMethod: event.target.value })}
          >
            <option value="">All methods</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </Select>
          <Input
            label="Search"
            value={filters.search}
            placeholder="Merchant or note"
            onChange={(event) => update({ search: event.target.value })}
          />
        </div>
      </div>

      {filters.category ? (
        <div className="flex items-center gap-2 text-[12px] text-text-tertiary">
          Showing
          <CategoryTag category={filters.category} />
        </div>
      ) : null}

      {loading ? <SkeletonRows /> : null}

      {!loading && expenses.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-14 text-center shadow-card">
          <Receipt size={22} strokeWidth={1.5} className="mx-auto text-text-tertiary" />
          <p className="mt-3 text-[13px] text-text-secondary">No expenses yet for this period</p>
        </div>
      ) : null}

      {!loading && expenses.length > 0 ? (
        <div className="space-y-3">
          {expenses.map((expense) => (
            <ExpenseRow key={expense.id} expense={expense} onEdit={onEdit} onDeleted={onDeleted} />
          ))}
          <div className="pt-2 text-right text-[12px] text-text-secondary">
            {expenses.length} expenses · {formatCurrency(total)} total
          </div>
        </div>
      ) : null}
    </section>
  );
}

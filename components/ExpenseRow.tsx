"use client";

import { Banknote, CreditCard, MoreHorizontal, Paperclip, Trash2, Pencil } from "lucide-react";
import { useState } from "react";
import { CategoryTag } from "@/components/CategoryTag";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatShortDate } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
import type { Expense } from "@/types/expense";

export function ExpenseRow({
  expense,
  onEdit,
  onDeleted
}: {
  expense: Expense;
  onEdit: (expense: Expense) => void;
  onDeleted: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function openReceipt() {
    if (!expense.receipt_url || !supabase) return;
    const { data, error } = await supabase.storage
      .from("receipts")
      .createSignedUrl(expense.receipt_url, 60);
    if (!error && data?.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function deleteExpense() {
    if (!supabase) return;
    const confirmed = window.confirm(`Delete ${expense.merchant}?`);
    if (!confirmed) return;

    setDeleting(true);
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
    setDeleting(false);
    if (!error) onDeleted();
  }

  const MethodIcon = expense.payment_method === "Cash" ? Banknote : CreditCard;

  return (
    <div
      className="group rounded-[20px] border border-border bg-surface p-4 shadow-card transition duration-200 ease-out hover:-translate-y-0.5 hover:border-border-emphasis"
      onClick={() => setExpanded((value) => !value)}
    >
      <div className="flex items-start gap-4">
        <div className="w-14 shrink-0 text-[12px] text-text-tertiary">{formatShortDate(expense.date)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-text-primary">{expense.merchant}</div>
              {expense.description ? (
                <div className="mt-0.5 hidden truncate text-[12px] text-text-secondary sm:block">
                  {expense.description}
                </div>
              ) : null}
            </div>
            <div className="shrink-0 text-right text-[13px] font-medium text-text-primary">
              {formatCurrency(expense.amount)}
            </div>
          </div>
          <div className="mt-3 hidden items-center gap-2 sm:flex">
            <CategoryTag category={expense.category} />
            <span className="inline-flex items-center gap-1 text-[12px] text-text-tertiary">
              <MethodIcon size={14} strokeWidth={1.5} />
              {expense.payment_method}
            </span>
            {expense.receipt_url ? (
              <button
                className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-text-tertiary transition hover:bg-subtle"
                onClick={(event) => {
                  event.stopPropagation();
                  openReceipt();
                }}
                type="button"
              >
                <Paperclip size={14} strokeWidth={1.5} />
                Receipt
              </button>
            ) : null}
          </div>
          {expanded ? (
            <div className="mt-3 space-y-2 text-[12px] text-text-secondary sm:hidden">
              {expense.description ? <div>{expense.description}</div> : null}
              <div className="flex flex-wrap items-center gap-2">
                <CategoryTag category={expense.category} />
                <span className="inline-flex items-center gap-1 text-text-tertiary">
                  <MethodIcon size={14} strokeWidth={1.5} />
                  {expense.payment_method}
                </span>
                {expense.receipt_url ? (
                  <button
                    className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-text-tertiary transition hover:bg-subtle"
                    onClick={(event) => {
                      event.stopPropagation();
                      openReceipt();
                    }}
                    type="button"
                  >
                    <Paperclip size={14} strokeWidth={1.5} />
                    Receipt
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <div className="relative" onClick={(event) => event.stopPropagation()}>
          <button
            aria-label="Expense actions"
            className="focus-ring rounded-md p-2 text-text-tertiary opacity-100 transition hover:bg-subtle sm:opacity-0 sm:group-hover:opacity-100"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
          >
            <MoreHorizontal size={18} strokeWidth={1.5} />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-10 mt-2 w-32 rounded-lg border border-border bg-surface p-1 shadow-card">
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[12px] text-text-secondary transition hover:bg-subtle"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(expense);
                }}
                type="button"
              >
                <Pencil size={14} strokeWidth={1.5} />
                Edit
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[12px] text-danger transition hover:bg-danger-soft"
                onClick={deleteExpense}
                disabled={deleting}
                type="button"
              >
                <Trash2 size={14} strokeWidth={1.5} />
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

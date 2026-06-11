import { SCHEDULE_C_CATEGORIES } from "@/lib/categories";
import { formatCurrency } from "@/lib/formatters";
import type { Expense } from "@/types/expense";

export function buildCategorySummary(expenses: Expense[]) {
  return SCHEDULE_C_CATEGORIES.map((category) => {
    const categoryExpenses = expenses.filter((expense) => expense.category === category);
    return {
      category,
      transactions: categoryExpenses.length,
      total: categoryExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0)
    };
  }).filter((row) => row.transactions > 0);
}

export function ReportTable({ expenses }: { expenses: Expense[] }) {
  const rows = buildCategorySummary(expenses);
  const totalTransactions = rows.reduce((sum, row) => sum + row.transactions, 0);
  const totalAmount = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <div className="overflow-hidden rounded-[24px] border border-border bg-surface p-5 shadow-card">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
            <th className="pb-3 font-medium">Category</th>
            <th className="pb-3 text-right font-medium">Transactions</th>
            <th className="pb-3 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.category} className="border-b border-border last:border-0">
              <td className="py-3 text-[13px] text-text-primary">{row.category}</td>
              <td className="py-3 text-right text-[13px] font-medium text-text-primary">{row.transactions}</td>
              <td className="py-3 text-right text-[13px] font-medium text-text-primary">
                {formatCurrency(row.total)}
              </td>
            </tr>
          ))}
          <tr>
            <td className="pt-4 text-[13px] font-medium text-text-primary">Total</td>
            <td className="pt-4 text-right text-[13px] font-medium text-text-primary">{totalTransactions}</td>
            <td className="pt-4 text-right text-[13px] font-medium text-text-primary">
              {formatCurrency(totalAmount)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

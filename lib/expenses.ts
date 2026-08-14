import { parseLocalDate, toInputDate } from "@/lib/formatters";
import type { Expense, ExpenseType, ProofState } from "@/types/expense";

export const EXPENSE_TYPES: ExpenseType[] = ["Standard", "Parking"];

/** Parking transactions are almost always this; used to prefill scanned rows. */
export const PARKING_CATEGORY = "Car & Truck";
export const PARKING_MERCHANT = "Parking";

export function proofState(expense: Pick<Expense, "receipt_id" | "proof_waived">): ProofState {
  if (expense.receipt_id) return "Attached";
  if (expense.proof_waived) return "Waived";
  return "Missing";
}

export function needsProof(expense: Pick<Expense, "receipt_id" | "proof_waived">) {
  return proofState(expense) === "Missing";
}

/** First day of the month an expense falls in, as a YYYY-MM-DD string. */
export function periodMonthOf(dateValue: string) {
  const date = parseLocalDate(dateValue);
  return toInputDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

/** The month Yana is normally filing: the one that just ended. */
export function previousPeriodMonth(today = new Date()) {
  return toInputDate(new Date(today.getFullYear(), today.getMonth() - 1, 1));
}

export function currentPeriodMonth(today = new Date()) {
  return toInputDate(new Date(today.getFullYear(), today.getMonth(), 1));
}

export function shiftPeriodMonth(periodMonth: string, offset: number) {
  const date = parseLocalDate(periodMonth);
  return toInputDate(new Date(date.getFullYear(), date.getMonth() + offset, 1));
}

export function periodMonthLabel(periodMonth: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    parseLocalDate(periodMonth)
  );
}

export function periodMonthShortLabel(periodMonth: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(
    parseLocalDate(periodMonth)
  );
}

/** Inclusive date bounds for querying a period month. */
export function periodMonthBounds(periodMonth: string) {
  const date = parseLocalDate(periodMonth);
  return {
    start: toInputDate(new Date(date.getFullYear(), date.getMonth(), 1)),
    end: toInputDate(new Date(date.getFullYear(), date.getMonth() + 1, 0))
  };
}

/** Drive folder name for a month, e.g. "01 January". Sorts correctly by name. */
export function driveMonthFolderName(periodMonth: string) {
  const date = parseLocalDate(periodMonth);
  const monthNumber = String(date.getMonth() + 1).padStart(2, "0");
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
  return `${monthNumber} ${monthName}`;
}

export function driveYearFolderName(periodMonth: string) {
  return String(parseLocalDate(periodMonth).getFullYear());
}

export function expenseTotal(expenses: Pick<Expense, "amount">[]) {
  return expenses.reduce((total, expense) => total + Number(expense.amount), 0);
}

export function sortByDateDesc<T extends { date: string }>(rows: T[]) {
  return [...rows].sort((a, b) => b.date.localeCompare(a.date));
}

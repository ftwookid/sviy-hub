/**
 * The household month.
 *
 * Two kinds of figure meet on the Finances page and they behave differently, so
 * they are typed differently. A `FinanceLine` is a standing amount somebody
 * typed in — the W2, rent, the car payment — and it is the same in every month
 * until it is edited. Everything else is derived from records the app already
 * keeps, and is never stored here.
 */

/** Buckets that hold typed-in lines. `Deductions` is absent on purpose: it is read from the books. */
export type FinanceBucket = "Gross Income" | "Tax Withheld" | "Needs" | "Debt" | "Investments & Savings";

export const FINANCE_BUCKETS: FinanceBucket[] = [
  "Gross Income",
  "Tax Withheld",
  "Needs",
  "Debt",
  "Investments & Savings"
];

export type FinanceLine = {
  id: string;
  created_at: string;
  updated_at: string | null;
  user_id: string;
  bucket: FinanceBucket;
  label: string;
  monthly_amount: number;
  note: string | null;
  sort_order: number;
};

/** Where a figure on the page came from. Shown on the row, because a linked number is not editable there. */
export type FinanceRowSource = "Manual" | "Clients" | "House Sitting" | "Transactions" | "Mileage";

export type FinanceRow = {
  key: string;
  label: string;
  amount: number;
  source: FinanceRowSource;
  /** The stored line behind a `Manual` row. Absent on derived rows. */
  lineId?: string;
  hint?: string;
  /** True for figures shown for context that must not be added into the total — the mileage deduction. */
  informational?: boolean;
};

/** Buckets as displayed, including the one that is read rather than typed. */
export type FinanceSectionKey = FinanceBucket | "Deductions";

export type FinanceSection = {
  key: FinanceSectionKey;
  /** `in` adds to the month, `out` takes from it. */
  direction: "in" | "out";
  rows: FinanceRow[];
  total: number;
};

export type MonthFinances = {
  periodMonth: string;
  sections: FinanceSection[];
  moneyIn: number;
  moneyOut: number;
  leftOver: number;
  /** The mileage deduction for the month. Never cash, so never in `moneyOut`. */
  mileageDeduction: number;
};

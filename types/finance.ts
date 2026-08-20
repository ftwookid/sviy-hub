/**
 * The household month.
 *
 * Two kinds of figure meet on the Finances page and they behave differently, so
 * they are typed differently. A `FinanceLine` is something somebody typed in —
 * the W2, rent, the car payment — and it carries a dated schedule rather than a
 * single amount, because these figures change and the months before the change
 * have to keep their old value. Everything else is derived from records the app
 * already keeps, and is never stored here.
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

/**
 * One change to a line: from this date, it is this much a month.
 *
 * `effective_from` is inclusive — the new amount applies on its own date. A line
 * that has stopped gets a rate of 0 rather than losing its history.
 */
export type FinanceRate = {
  id: string;
  created_at: string;
  line_id: string;
  user_id: string;
  effective_from: string;
  monthly_amount: number;
};

export type FinanceLine = {
  id: string;
  created_at: string;
  updated_at: string | null;
  user_id: string;
  bucket: FinanceBucket;
  label: string;
  note: string | null;
  sort_order: number;
  /** Ascending by `effective_from`. Empty means the line has no amount set yet. */
  rates: FinanceRate[];
};

/** Where a figure on the page came from. Shown on the row, because a linked number is not editable. */
export type FinanceRowSource = "Manual" | "Clients" | "House Sitting" | "Transactions" | "Mileage";

export type FinanceRow = {
  key: string;
  label: string;
  amount: number;
  source: FinanceRowSource;
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

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

/**
 * Buckets that hold typed-in lines — which is now all of them.
 *
 * `Deductions` here means what comes out of pay before it lands: health
 * insurance, a repayment, anything withheld that is not tax. It is **not** the
 * business deduction that lowers a tax bill — that question is Taxes' and is
 * answered on Reports, off the transactions and the miles. Finances used to show
 * that figure under this name, which put a tax total in the middle of a cash-flow
 * page and left nowhere to type the deductions that really do leave the paycheck.
 */
export type FinanceBucket =
  | "Gross Income"
  | "Tax Withheld"
  | "Deductions"
  | "Needs"
  | "Subscriptions"
  | "Debt"
  | "Investments & Savings";

export const FINANCE_BUCKETS: FinanceBucket[] = [
  "Gross Income",
  "Tax Withheld",
  "Deductions",
  "Needs",
  "Subscriptions",
  "Debt",
  "Investments & Savings"
];

/**
 * How often a figure actually arrives or is paid.
 *
 * Every rate is stored as a monthly amount, because that is what a month is
 * built out of — but almost nothing is genuinely paid monthly. A W2 lands every
 * second week, insurance goes out quarterly. Typing the paycheck into a field
 * that means "a month" understates the year by 2.17x and nothing on the page
 * says so, so the cadence is recorded next to the figure that was typed and the
 * monthly equivalent is derived from the pair.
 */
export type PayCadence = "Weekly" | "Bi-weekly" | "Semi-monthly" | "Monthly" | "Quarterly" | "Annual";

export const PAY_CADENCES: PayCadence[] = [
  "Weekly",
  "Bi-weekly",
  "Semi-monthly",
  "Monthly",
  "Quarterly",
  "Annual"
];

/**
 * One change to a line: from this date, it is this much a month.
 *
 * `effective_from` is inclusive — the new amount applies on its own date, and so
 * is `effective_to`, which is null while the line is still running. A line that
 * has stopped keeps its history: it is ended, not deleted.
 */
export type FinanceRate = {
  id: string;
  created_at: string;
  line_id: string;
  user_id: string;
  effective_from: string;
  /**
   * The monthly figure, derived — the **average**, not what any month pays.
   *
   * A month is built from `entered_amount` on the dates the cadence actually
   * pays, so this column no longer feeds the dashboard's arithmetic. It is what
   * a line is worth per month over a year, which is the right figure for a run
   * rate and for Setup's at-a-glance column (where it is tagged `avg`), and the
   * wrong one for "what landed in August".
   */
  monthly_amount: number;
  /** What was actually typed: the paycheck, the quarterly bill. */
  entered_amount: number;
  cadence: PayCadence;
  /**
   * The last day this amount is paid, inclusive — or null while it is still
   * running.
   *
   * Ending a line used to mean entering a change to 0, which is right about the
   * arithmetic and wrong about everything else: the line kept a $0.00 row in
   * every month afterwards, and a commitment that was cancelled read the same as
   * one that happens to be free at the moment. An end date says the thing that
   * was actually meant, and a line with one simply stops appearing in the months
   * after it.
   */
  effective_to: string | null;
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

/** One payment: the day it lands and what it is worth. */
export type FinancePayment = { date: string; amount: number };

/** One fact about a line, read label-left, value-right. */
export type FinanceDetailRow = { label: string; value: string };

/**
 * What a line's `ⓘ` opens to.
 *
 * Every row in here has to say something the month row cannot. That test threw
 * out the first version, which listed every payment by date: on a line whose
 * payments are all the same — which is almost every line, almost every month —
 * "Sep 3 $302.30 / Sep 17 $302.30" is one fact printed twice, and the reader
 * already had it from the row.
 */
export type FinanceDetail = { rows: FinanceDetailRow[] };

/**
 * Where a figure on the page came from. Shown on the row, because a linked number
 * is not editable here.
 *
 * `Utilities` is linked like the other two: the amount lives in `utility_bills`,
 * which is the only place it can be corrected, because that table is also where
 * its history — the whole point of tracking a water bill — is kept.
 */
export type FinanceRowSource = "Manual" | "Clients" | "House Sitting" | "Utilities";

export type FinanceRow = {
  key: string;
  label: string;
  amount: number;
  source: FinanceRowSource;
  hint?: string;
  /**
   * The row's working — what the figure is made of, and what moved it.
   *
   * Dates are in here only when they carry the answer, which is the month a
   * change lands in and no other. What is worth knowing the rest of the time is
   * what one payment is worth, how many landed against how many usually do, and
   * when the amount last moved.
   */
  detail?: FinanceDetail;
  /**
   * What this line costs in a year at the rate in force — **not** the month
   * times twelve.
   *
   * Once a month counts the payments that actually land in it, month × 12 is
   * nonsense in the two months that carry a third paycheck: a $302.30
   * fortnightly tax reads $906.90 in August and would annualise to $10,883
   * against a real year of $7,859.80. The run rate has to come from the rate
   * and its cadence, which is what `monthly_amount` already holds an average of.
   */
  yearAmount?: number;
};

/** Buckets as displayed. Every one of them is a bucket now. */
export type FinanceSectionKey = FinanceBucket;

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
};

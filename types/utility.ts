import type { FinanceBucket } from "@/types/finance";

/**
 * Utilities — the standing commitment whose amount is never the same twice.
 *
 * A `FinanceLine` is a schedule: an amount, from a date, until somebody types a
 * change. Water, power and gas do not work like that. The figure moves every
 * month, nobody is going to enter twelve dated "changes" a year, and the
 * question these bills raise is one a schedule cannot answer — is it going up?
 *
 * So an account holds what the thing *is* and where it belongs on the month, and
 * a bill holds one month's actual amount. The history is the point, not a side
 * effect.
 */

/**
 * Where a utility lands on the month.
 *
 * Money-out buckets only. A water bill is not gross income, and offering a
 * choice that cannot be right is worse than offering none. `Needs` is the
 * default because that is what these bills are; it is a column rather than a
 * constant because a metered line somebody thinks of as a subscription should
 * appear where its owner looks for it.
 */
export type UtilityBucket = Exclude<FinanceBucket, "Gross Income">;

export const UTILITY_BUCKETS: UtilityBucket[] = [
  "Needs",
  "Subscriptions",
  "Deductions",
  "Debt",
  "Tax Withheld",
  "Investments & Savings"
];

export const DEFAULT_UTILITY_BUCKET: UtilityBucket = "Needs";

export type UtilityAccount = {
  id: string;
  created_at: string;
  updated_at: string | null;
  user_id: string;
  name: string;
  bucket: UtilityBucket;
  sort_order: number;
};

/** One month's actual bill. `period_month` is the 1st of the month it covers. */
export type UtilityBill = {
  id: string;
  created_at: string;
  account_id: string;
  user_id: string;
  period_month: string;
  amount: number;
  note: string | null;
};

/** An account with its bills, oldest first — the shape every reader below wants. */
export type UtilityAccountBills = { account: UtilityAccount; bills: UtilityBill[] };

/** Accounts and their bills, grouped once so the year is not regrouped twelve times. */
export type UtilityBook = UtilityAccountBills[];

/**
 * Where a month's figure came from.
 *
 * `billed` is the bill that was actually entered. `estimate` is the average of
 * the last few, for the month whose bill has not arrived yet — a commitment that
 * is certainly coming has to be in the month, or "how much of this month is
 * already promised" is wrong by the size of the utilities. `none` is before the
 * first bill, and is worth nothing rather than a guess.
 */
export type UtilityBasis = "billed" | "estimate" | "none";

export type UtilityMonthValue = {
  amount: number;
  basis: UtilityBasis;
  /** How many bills the estimate averaged. Zero for the other two. */
  from: number;
};

/** How a utility has moved: the last twelve months against the twelve before. */
export type UtilityTrend = {
  recentAverage: number | null;
  priorAverage: number | null;
  /** Fractional change between the two, or null when either window is too thin to compare. */
  change: number | null;
};

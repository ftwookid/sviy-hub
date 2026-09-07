import { periodMonthShortLabel, shiftPeriodMonth } from "@/lib/expenses";
import { formatCurrency, parseLocalDate, toInputDate } from "@/lib/formatters";
import type { FinanceBucket, FinanceDetailRow, FinanceRow } from "@/types/finance";
import type {
  UtilityAccount,
  UtilityBill,
  UtilityBook,
  UtilityMonthValue,
  UtilityTrend
} from "@/types/utility";

/**
 * What the utilities come to, and which way they are going.
 *
 * Pure, like `lib/finances.ts` and for the same reason: these figures are added
 * into the month the household is judged by, so no query gets to change the
 * answer. Everything here reads rows somebody else loaded.
 *
 * The arithmetic has one real decision in it — what a month is worth **before**
 * its bill has arrived. Leaving it at zero would be the honest-looking answer
 * and the wrong one: the water bill is certainly coming, and a month that omits
 * it understates what is already promised by exactly the amount the page exists
 * to keep track of. So an unbilled month carries the average of the last few
 * bills and says so, on the row and in its detail. Before the *first* bill there
 * is nothing to average and the account is worth nothing — a guess with no data
 * behind it is the zero-pretending-to-be-a-figure this app keeps catching.
 */

/** How many recent bills an estimate averages. Enough to absorb one cold month, few enough to follow a real rise. */
const ESTIMATE_WINDOW = 3;

/** The window each side of the year-over-year comparison. */
const TREND_WINDOW = 12;

/** Neither side of the comparison is stated off fewer than this many bills. */
const TREND_MINIMUM = 3;

export function periodMonthOf(year: number, monthIndex: number) {
  return toInputDate(new Date(year, monthIndex, 1));
}

/** The 1st of the month a date falls in — every bill is stored on it. */
export function toPeriodMonth(dateValue: string) {
  const date = parseLocalDate(dateValue);
  return toInputDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

/**
 * Accounts with their bills, oldest first.
 *
 * Grouped once. Every reader below assumes the order, and a year is twelve
 * months × seven buckets of reads — regrouping inside each of them is how a
 * cheap page becomes a slow one.
 */
export function utilityBook(accounts: UtilityAccount[], bills: UtilityBill[]): UtilityBook {
  const grouped = new Map<string, UtilityBill[]>();
  bills.forEach((bill) => {
    const list = grouped.get(bill.account_id);
    if (list) list.push(bill);
    else grouped.set(bill.account_id, [bill]);
  });

  return [...accounts]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((account) => ({
      account,
      bills: (grouped.get(account.id) ?? [])
        .map((bill) => ({ ...bill, amount: Number(bill.amount) }))
        .sort((a, b) => a.period_month.localeCompare(b.period_month))
    }));
}

function mean(amounts: number[]) {
  if (amounts.length === 0) return null;
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  return Math.round((total / amounts.length) * 100) / 100;
}

export function billFor(bills: UtilityBill[], periodMonth: string) {
  return bills.find((bill) => bill.period_month === periodMonth) ?? null;
}

/**
 * What an account is worth in one month, and on what grounds.
 *
 * The bill if there is one. Otherwise the average of the last few — the bill has
 * not landed yet, but it is coming, and a month that leaves it out is wrong
 * about the only thing this page measures. Before the first bill, nothing.
 */
export function monthValue(bills: UtilityBill[], periodMonth: string): UtilityMonthValue {
  const exact = billFor(bills, periodMonth);
  if (exact) return { amount: exact.amount, basis: "billed", from: 0 };

  const earlier = bills.filter((bill) => bill.period_month < periodMonth).slice(-ESTIMATE_WINDOW);
  const average = mean(earlier.map((bill) => bill.amount));
  if (average === null) return { amount: 0, basis: "none", from: 0 };

  return { amount: average, basis: "estimate", from: earlier.length };
}

/**
 * The twelve months of one calendar year, each with its bill or null.
 *
 * A calendar year rather than a rolling window, because this is what a reader
 * navigates by: nobody hunts for "the bill eleven months back", they think
 * "March, the year the boiler went". It is also what makes the history reachable
 * at all — a rolling twelve anchored on the page's month can only ever show the
 * last twelve, so four years of electricity had three of them with no way in.
 */
export function monthsOfYear(bills: UtilityBill[], year: number) {
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const month = periodMonthOf(year, monthIndex);
    return { periodMonth: month, monthIndex, bill: billFor(bills, month) };
  });
}

/** The year of the first bill on an account, or null while none has been entered. */
export function firstBillYear(bills: UtilityBill[]) {
  return bills.length > 0 ? parseLocalDate(bills[0].period_month).getFullYear() : null;
}

/** The bills covering `count` months ending at `periodMonth`, months without one included as null. */
export function monthsEnding(bills: UtilityBill[], periodMonth: string, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const month = shiftPeriodMonth(periodMonth, index - (count - 1));
    return { periodMonth: month, bill: billFor(bills, month) };
  });
}

function averageEnding(bills: UtilityBill[], periodMonth: string, count: number) {
  const known = monthsEnding(bills, periodMonth, count)
    .map((entry) => entry.bill)
    .filter((bill): bill is UtilityBill => bill !== null);
  return { average: mean(known.map((bill) => bill.amount)), count: known.length };
}

/**
 * The last twelve months against the twelve before them.
 *
 * This is the answer to the question the whole feature exists for, and it is
 * stated as two figures and the change between them — never as a sentence about
 * what to do next. A window holding fewer than three bills does not get to claim
 * a direction, so a first year of tracking says nothing rather than something
 * made up.
 */
export function utilityTrend(bills: UtilityBill[], periodMonth: string): UtilityTrend {
  const recent = averageEnding(bills, periodMonth, TREND_WINDOW);
  const prior = averageEnding(bills, shiftPeriodMonth(periodMonth, -TREND_WINDOW), TREND_WINDOW);

  const comparable =
    recent.average !== null &&
    prior.average !== null &&
    prior.average > 0 &&
    recent.count >= TREND_MINIMUM &&
    prior.count >= TREND_MINIMUM;

  return {
    recentAverage: recent.average,
    priorAverage: prior.average,
    change: comparable ? recent.average! / prior.average! - 1 : null
  };
}

/** The most recent bill on the account, or null while none has been entered. */
export function latestBill(bills: UtilityBill[]) {
  return bills.length > 0 ? bills[bills.length - 1] : null;
}

/**
 * What the row's `ⓘ` opens to — same test as every other row on the month: does
 * it say something the figure cannot?
 *
 * Four things do. That the figure is an estimate rather than a bill, which
 * changes how much weight it carries. Last month, which is the comparison a
 * reader makes anyway and would otherwise mean opening the panel. The same month
 * a year ago, because a utility is seasonal and January against December says
 * nothing. And the twelve-month average, which is the line every single month is
 * noise around.
 */
function utilityDetail(bills: UtilityBill[], periodMonth: string, value: UtilityMonthValue) {
  const rows: FinanceDetailRow[] = [];

  if (value.basis === "estimate") {
    rows.push({
      label: "Estimated",
      value: `avg of last ${value.from} ${value.from === 1 ? "bill" : "bills"}`
    });
  }

  const previous = billFor(bills, shiftPeriodMonth(periodMonth, -1));
  if (previous) {
    rows.push({ label: periodMonthShortLabel(previous.period_month), value: formatCurrency(previous.amount) });
  }

  const yearAgo = billFor(bills, shiftPeriodMonth(periodMonth, -12));
  if (yearAgo) {
    rows.push({ label: periodMonthShortLabel(yearAgo.period_month), value: formatCurrency(yearAgo.amount) });
  }

  const { recentAverage } = utilityTrend(bills, periodMonth);
  if (recentAverage !== null && bills.length > 1) {
    rows.push({ label: "12-month average", value: formatCurrency(recentAverage) });
  }

  return { rows };
}

/**
 * The rows a bucket gets from the utilities in one month.
 *
 * They are `source: "Utilities"` — a linked figure, like the clients and the
 * house sitting, and for the same reason: the amount is recorded somewhere that
 * already owns it, so a second editable copy on the month would be a figure that
 * silently goes stale. It is edited where it is entered.
 */
export function utilityRowsForBucket(
  book: UtilityBook,
  bucket: FinanceBucket,
  year: number,
  monthIndex: number
): FinanceRow[] {
  const periodMonth = periodMonthOf(year, monthIndex);

  return book
    .filter((entry) => entry.account.bucket === bucket)
    .map(({ account, bills }) => {
      const value = monthValue(bills, periodMonth);
      const { recentAverage } = utilityTrend(bills, periodMonth);

      return {
        key: `utility:${account.id}`,
        label: account.name,
        amount: value.amount,
        source: "Utilities" as const,
        // The run rate off the twelve-month average, not this month × 12: a
        // January heating bill annualised is a number nobody will ever pay.
        yearAmount: (recentAverage ?? value.amount) * 12,
        detail: utilityDetail(bills, periodMonth, value),
        hint:
          value.basis === "none"
            ? "No bills entered yet"
            : value.basis === "estimate"
              ? "Estimated — this month's bill is not in yet"
              : undefined
      };
    });
}

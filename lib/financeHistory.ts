import { periodMonthShortLabel, shiftPeriodMonth } from "@/lib/expenses";
import { amountForMonth, endedOn, onPaydays, paydayWeekdayFor } from "@/lib/finances";
import { toPeriodMonth } from "@/lib/utilities";
import { parseLocalDate } from "@/lib/formatters";
import type { FinanceHistory, FinanceHistoryPoint, FinanceLine, FinanceRow } from "@/types/finance";
import type { UtilityBook } from "@/types/utility";

/**
 * A line's past, as the same figure the month prints for it.
 *
 * Pure, like `lib/finances.ts` and `lib/utilities.ts`, and for the same reason:
 * this is the shape a household reads a commitment by, so no query gets to
 * change it. Everything here works over rows somebody else loaded.
 *
 * **It is computed when a line is opened, not when the month is built.** The
 * month is assembled twelve times over — once per month of the year, for
 * `YearList` — and a timeline hung on every row of every one of those would be
 * twelve identical answers to a question nobody has asked yet. So the row stays
 * what it was and this resolves a row against the same sources the page already
 * holds, once, on the tap that opens it.
 */

/**
 * How far back a timeline reaches.
 *
 * Two years, because that is what makes a metered bill readable: one year alone
 * cannot say whether this January was worse than last January, and a utility is
 * seasonal before it is anything else. It is also about as many points as fit at
 * 390px without the line turning into a comb — 24 points across ~330px sit 14px
 * apart.
 *
 * The Utilities panel is still where a fifth year of bills is browsed. This is
 * the trend, not the archive.
 */
export const HISTORY_MONTHS = 24;

/** The window each side of the "is it creeping up" comparison. */
const TREND_WINDOW = 12;

/** Neither side of that comparison is claimed off fewer than this many months. */
const TREND_MINIMUM = 3;

/** Whole months from one period month to another. Negative when `to` is earlier. */
export function monthsBetween(from: string, to: string) {
  const start = parseLocalDate(from);
  const end = parseLocalDate(to);
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

/** The `count` months ending at `periodMonth`, oldest first. */
export function historyMonths(periodMonth: string, count = HISTORY_MONTHS) {
  return Array.from({ length: count }, (_, index) => shiftPeriodMonth(periodMonth, index - (count - 1)));
}

/** The first month a timeline ending here reaches back to. */
function windowStart(periodMonth: string, count = HISTORY_MONTHS) {
  return shiftPeriodMonth(periodMonth, -(count - 1));
}

function mean(amounts: number[]) {
  if (amounts.length === 0) return null;
  return Math.round((amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length) * 100) / 100;
}

/**
 * A typed line, month by month.
 *
 * The measure is `amountForMonth` — what actually landed — which is exactly what
 * the row prints, so the last point and the figure at the top of the panel are
 * the same number rather than two nearly-equal ones. That also means a
 * fortnightly line saws between two and three paychecks, and a quarterly bill
 * drops to nothing in the months it is not due. Both are true, and both are the
 * reason a month reads bigger than the one before it.
 *
 * Months outside the line's own life are **absent**, not zero: before its first
 * change the line did not exist, and after its end date it is over. A zero there
 * would draw a commitment falling off a cliff it never stood on.
 */
export function lineHistory(line: FinanceLine, periodMonth: string): FinanceHistory {
  const rates = onPaydays(line.rates, paydayWeekdayFor(line.label));
  if (rates.length === 0) return { points: [], note: "No amount set yet" };

  const born = toPeriodMonth(rates[0].effective_from);
  const stopped = endedOn(rates);
  const died = stopped === null ? null : toPeriodMonth(stopped);

  const months = (from: string, to: string | null) =>
    historyMonths(periodMonth)
      .filter((month) => month >= from && (to === null || month <= to))
      .map((month) => {
        const date = parseLocalDate(month);
        return { periodMonth: month, amount: amountForMonth(rates, date.getFullYear(), date.getMonth()) };
      });

  // A part-month at either end is dropped, and this is the one judgement in
  // here. A line whose first change is dated the 25th collected one paycheck in
  // that month rather than two, so it plots at half height — and read as the low
  // of a timeline that is *about* the level of a commitment, that is a claim the
  // data does not make. The date is usually when the figure was typed into the
  // app anyway, not when the commitment started. Same at the far end for a line
  // stopped mid-month.
  //
  // It only ever trims, never invents, and it gives way when trimming would
  // leave nothing to draw: a stub month is a poor reading and no reading at all
  // is a worse one.
  const wholeFrom = startsWhole(rates[0].effective_from) ? born : shiftPeriodMonth(born, 1);
  const wholeTo = stopped === null || endsWhole(stopped) ? died : shiftPeriodMonth(died!, -1);

  const trimmed = months(wholeFrom, wholeTo);
  return { points: trimmed.length >= 2 ? trimmed : months(born, died) };
}

/** Does a rate start on the 1st, so its opening month is a whole one? */
function startsWhole(dateValue: string) {
  return parseLocalDate(dateValue).getDate() === 1;
}

/** Does an end date fall on the last day of its month, so that month is whole? */
function endsWhole(dateValue: string) {
  const date = parseLocalDate(dateValue);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() === date.getDate();
}

/**
 * A utility, bill by bill.
 *
 * **Only months that were actually billed.** `monthValue` carries an estimate
 * into an unbilled month, which is right on the dashboard — the water bill is
 * coming whether or not it has arrived, and a month that omits it understates
 * what is already promised — and wrong here, where the whole point is to look at
 * what was really charged. Plotting an average of the last three as though it
 * were a reading would put a flat invented stretch on the end of the only chart
 * in the app whose job is to show a real one.
 *
 * So the line simply stops at the last bill, and the panel's figure at the top
 * still says "Estimated" for the month on screen.
 */
export function utilityHistory(bills: { period_month: string; amount: number }[], periodMonth: string) {
  const from = windowStart(periodMonth);
  const points: FinanceHistoryPoint[] = bills
    .filter((bill) => bill.period_month >= from && bill.period_month <= periodMonth)
    .map((bill) => ({ periodMonth: bill.period_month, amount: Number(bill.amount) }));

  return {
    points,
    note:
      bills.length === 0
        ? "No bills entered yet — add one in Utilities and it lands here"
        : points.length === 0
          ? "No bills in the last two years"
          : undefined
  };
}

/**
 * House sitting, month by month across the year on screen.
 *
 * The page loads the stays that touch the selected year and no others, so this
 * is a year rather than the two years everything else gets. Stretching it would
 * mean a second query for data the month behind the panel does not need.
 *
 * Months with no stays are **kept, at zero**: unlike a line that did not exist
 * yet, a month with nothing booked genuinely earned nothing, and dropping it
 * would join December to March as though they were consecutive.
 */
export function houseSittingHistory(net: number[], periodMonth: string): FinanceHistory {
  const date = parseLocalDate(periodMonth);
  const year = date.getFullYear();
  const points = net.slice(0, date.getMonth() + 1).map((amount, monthIndex) => ({
    periodMonth: `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`,
    amount: Math.round(amount * 100) / 100
  }));

  return { points, note: points.length < 2 ? "The year has only just started" : undefined };
}

/**
 * What the sources a row can come from look like, gathered once by the page.
 *
 * The page already holds all four to build the month at all, so opening a line
 * costs no query — which is the whole reason this is a panel over the month
 * rather than a route away from it.
 */
export type HistorySources = {
  lines: FinanceLine[];
  book: UtilityBook;
  houseSitting: { net: number[]; nights: number[] };
};

/**
 * The timeline behind one row on the month.
 *
 * Keyed off the row key the month was built with, which is the only handle the
 * card has: a line's id, `utility:<id>`, or one of the two linked constants.
 */
export function rowHistory(row: FinanceRow, sources: HistorySources, periodMonth: string): FinanceHistory {
  if (row.key.startsWith("utility:")) {
    const accountId = row.key.slice("utility:".length);
    const entry = sources.book.find(({ account }) => account.id === accountId);
    return entry ? utilityHistory(entry.bills, periodMonth) : { points: [] };
  }

  if (row.key === "house-sitting") return houseSittingHistory(sources.houseSitting.net, periodMonth);

  // The regular clients are one current estimate applied to every month — a
  // client record says what the arrangement is now and keeps no record of which
  // months were worked. Drawing that as a flat line across two years would be a
  // chart of an assumption.
  if (row.key === "clients") {
    return {
      points: [],
      note: "A current estimate, not a record — a client says what the arrangement is now, not what each month came to."
    };
  }

  const line = sources.lines.find((candidate) => candidate.id === row.key);
  return line ? lineHistory(line, periodMonth) : { points: [] };
}

/**
 * The three figures above the chart.
 *
 * Each has to answer something the chart cannot, which rules out the obvious
 * two: the high and the low are marked on the plot itself, and this month's
 * figure is the headline directly above. What is left is the level the line is
 * noise around, the seasonally honest comparison, and the direction.
 */
export type HistorySummary = {
  /** The mean of the last twelve months that have a figure. */
  average: number | null;
  /** The same month a year earlier — the only fair comparison for a seasonal bill. */
  yearAgo: { amount: number; label: string } | null;
  /** Trailing twelve against the twelve before, as a fraction. Null when either side is too thin. */
  change: number | null;
};

export function historySummary(points: FinanceHistoryPoint[], periodMonth: string): HistorySummary {
  const inWindow = (from: string, to: string) =>
    points.filter((point) => point.periodMonth >= from && point.periodMonth <= to);

  const recent = inWindow(shiftPeriodMonth(periodMonth, -(TREND_WINDOW - 1)), periodMonth);
  const prior = inWindow(
    shiftPeriodMonth(periodMonth, -(TREND_WINDOW * 2 - 1)),
    shiftPeriodMonth(periodMonth, -TREND_WINDOW)
  );

  const recentAverage = mean(recent.map((point) => point.amount));
  const priorAverage = mean(prior.map((point) => point.amount));

  const lastYearMonth = shiftPeriodMonth(periodMonth, -12);
  const lastYear = points.find((point) => point.periodMonth === lastYearMonth) ?? null;

  return {
    average: recentAverage,
    yearAgo: lastYear
      ? { amount: lastYear.amount, label: periodMonthShortLabel(lastYear.periodMonth) }
      : null,
    // A window holding fewer than three months does not get to claim a
    // direction, and a prior average of zero has no percentage to give.
    change:
      recentAverage !== null &&
      priorAverage !== null &&
      priorAverage > 0 &&
      recent.length >= TREND_MINIMUM &&
      prior.length >= TREND_MINIMUM
        ? recentAverage / priorAverage - 1
        : null
  };
}

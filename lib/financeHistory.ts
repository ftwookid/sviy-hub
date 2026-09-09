import { periodMonthBounds, periodMonthShortLabel, shiftPeriodMonth } from "@/lib/expenses";
import { clientPriceOn, clientStartDate, estimateClientFromRecord } from "@/lib/clients";
import { amountForMonth, endedOn, onPaydays, paydayWeekdayFor } from "@/lib/finances";
import { monthValue, toPeriodMonth } from "@/lib/utilities";
import { parseLocalDate } from "@/lib/formatters";
import { FINANCE_BUCKETS } from "@/types/finance";
import type { ClientWithPets } from "@/types/client";
import type {
  FinanceBucket,
  FinanceHistory,
  FinanceHistoryPoint,
  FinanceHome,
  FinanceLine,
  FinanceRow
} from "@/types/finance";
import type { UtilityBill, UtilityBook } from "@/types/utility";

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
 * The range the chart opens on, and the one the stats are quoted over.
 *
 * A timeline is now built **whole** — every month the line has ever had — and
 * the ranges are cuts of it taken in the component. It was capped at 24 months
 * on the reasoning that two years is what makes a seasonal bill readable and
 * that more points than that turn a phone-width line into a comb. The first half
 * still holds and is why this is the default; the second stopped being a reason
 * the moment the chart learned to thin its own labels rather than scroll.
 */
export const DEFAULT_HISTORY_MONTHS = 12;

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

/** Every month from `start` to `periodMonth` inclusive, oldest first. */
export function historyMonths(start: string, periodMonth: string) {
  const length = Math.max(0, monthsBetween(start, periodMonth) + 1);
  return Array.from({ length }, (_, index) => shiftPeriodMonth(start, index));
}

/** The last `count` months of a series — what the default range shows. */
export function lastMonths(points: FinanceHistoryPoint[], count: number) {
  return count >= points.length ? points : points.slice(points.length - count);
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
 *
 * `trim` is what a block turns off. See `memberHistory`: inside a sum, a
 * trimmed month is not a missing point but a missing *member*, and the block
 * would dip by the whole of that line in a month it really was paid in.
 */
export function lineHistory(
  line: FinanceLine,
  periodMonth: string,
  options: { trim?: boolean } = {}
): FinanceHistory {
  const rates = onPaydays(line.rates, paydayWeekdayFor(line.label));
  if (rates.length === 0) return { points: [], note: "No amount set yet" };

  const born = toPeriodMonth(rates[0].effective_from);
  const stopped = endedOn(rates);
  const died = stopped === null ? null : toPeriodMonth(stopped);

  const months = (from: string, to: string | null) =>
    historyMonths(from, to !== null && to < periodMonth ? to : periodMonth).map((month) => {
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

  if (options.trim === false) return { points: months(born, died) };

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
  const points: FinanceHistoryPoint[] = bills
    .filter((bill) => bill.period_month <= periodMonth)
    .map((bill) => ({ periodMonth: bill.period_month, amount: Number(bill.amount) }));

  return {
    points,
    note:
      bills.length === 0
        ? "No bills entered yet — add one in Utilities and it lands here"
        : points.length === 0
          ? "Every bill on this account is dated after the month on screen"
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
 * The regular clients, month by month.
 *
 * This block used to draw nothing, on the reasoning that a client record says
 * what the arrangement is *now* and keeps no record of which months were worked
 * — so a chart of it would be a chart of an assumption. That was half right and
 * threw away the half the app does have: **`price_history` is dated**, and every
 * client carries the day it started. So a month is priced at what was actually
 * being charged in it, and a client contributes only to the months it was on the
 * books for. A rate rise in May steps the line in May, exactly like a
 * subscription.
 *
 * What is still an estimate, and always will be, is the *visits*: a client says
 * how many days a week it is, not which weeks were actually worked. So this is
 * the standing arrangement re-priced month by month — the same thing the row on
 * the month is, which is the whole rule for what a timeline plots.
 *
 * Paused clients are excluded throughout, matching `clientMonthlyIncome`. The
 * status is a single current flag with no history, so a client paused today is
 * absent from the whole line rather than from the months since it paused; that
 * is the one thing here the data cannot say, and inventing a date for it would
 * be worse than leaving the figure where the dashboard already puts it.
 */
export function clientsHistory(clients: ClientWithPets[], periodMonth: string): FinanceHistory {
  const active = clients.filter((client) => client.status === "Active");
  if (active.length === 0) return { points: [], note: "No active clients" };

  const opened = active.map((client) => clientStartDate(client)).sort()[0];

  const points = historyMonths(toPeriodMonth(opened), periodMonth)
    .map((month) => {
      const { end } = periodMonthBounds(month);
      const earning = active.filter((client) => clientStartDate(client) <= end);
      if (earning.length === 0) return null;

      const amount = earning.reduce(
        (total, client) =>
          total +
          estimateClientFromRecord({ ...client, price_per_visit: clientPriceOn(client, end) }).monthlyNet,
        0
      );
      return { periodMonth: month, amount: Math.round(amount * 100) / 100 };
    })
    .filter((point): point is FinanceHistoryPoint => point !== null);

  return { points };
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
  clients: ClientWithPets[];
  /** Where the household lived, for the chart's `By home` reading. Empty until the migration runs. */
  homes: FinanceHome[];
};

/**
 * The timeline behind one row on the month.
 *
 * Keyed off the row key the month was built with, which is the only handle the
 * card has: a line's id, `utility:<id>`, or one of the two linked constants.
 */
export function rowHistory(row: { key: string }, sources: HistorySources, periodMonth: string): FinanceHistory {
  if (row.key.startsWith("utility:")) {
    const accountId = row.key.slice("utility:".length);
    const entry = sources.book.find(({ account }) => account.id === accountId);
    return entry ? utilityHistory(entry.bills, periodMonth) : { points: [] };
  }

  if (row.key === "house-sitting") return houseSittingHistory(sources.houseSitting.net, periodMonth);

  if (row.key === "clients") return clientsHistory(sources.clients, periodMonth);

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

/**
 * A whole block, month by month — the same question one line answers, asked of
 * the category it sits in.
 *
 * "Is this creeping up" is worth asking of `Subscriptions` and `Needs` at least
 * as much as of any one line in them: a pile of small services is exactly the
 * thing no single row can show growing. So a block opens to the same panel a row
 * does, and what it plots is **the sum of its members, month by month** — the
 * figure the month's `SectionTotal` prints, extended backwards.
 *
 * Membership is read off the **sources**, not off the month on screen. A
 * subscription cancelled in March is not in September's rows and was certainly
 * part of what the block cost in February; taking the current month's rows as
 * the member list would erase it from its own history.
 */
function bucketDirection(bucket: FinanceBucket): "in" | "out" {
  return bucket === "Gross Income" ? "in" : "out";
}

/** Every row key a block is made of, whether or not it has a figure this month. */
export function sectionMemberKeys(bucket: FinanceBucket, sources: HistorySources): string[] {
  return [
    ...sources.lines.filter((line) => line.bucket === bucket).map((line) => line.id),
    ...sources.book
      .filter(({ account }) => account.bucket === bucket)
      .map(({ account }) => `utility:${account.id}`),
    // The two linked figures land in Gross income and nowhere else.
    ...(bucket === "Gross Income" ? ["clients", "house-sitting"] : [])
  ];
}

/** Every row key on one side of the month — what `Money in` and `Money out` are made of. */
export function sideMemberKeys(direction: "in" | "out", sources: HistorySources): string[] {
  return FINANCE_BUCKETS.filter((bucket) => bucketDirection(bucket) === direction).flatMap((bucket) =>
    sectionMemberKeys(bucket, sources)
  );
}

/**
 * A utility as a block counts it: the bill, or the estimate the month carries.
 *
 * On its own the account plots real bills only — that chart exists to show what
 * was actually charged, and an invented flat stretch on the end of it would be
 * the one lie it cannot afford. Inside a block the rule flips, because the
 * measure has to be **the one the month prints for the block**: a category that
 * drops by the whole water bill in a month whose paperwork has not been typed
 * yet is a chart of missing paperwork, not of a household spending less.
 */
export function utilitySectionHistory(bills: UtilityBill[], periodMonth: string): FinanceHistory {
  const started = bills.filter((bill) => bill.period_month <= periodMonth)[0] ?? null;
  if (!started) return { points: [] };

  return {
    points: historyMonths(started.period_month, periodMonth).map((month) => ({
      periodMonth: month,
      amount: monthValue(bills, month).amount
    }))
  };
}

/**
 * One member of a block, and the two things a sum needs to know about it beyond
 * its figures.
 *
 * `yearScoped` marks a member whose absence early on is a limit of what the page
 * loaded rather than a fact about the household — house sitting is read for the
 * selected year only, so a block containing it cannot honestly be plotted before
 * that year starts. `partialStart` marks a member whose opening month is a part
 * month, which is what lets the block drop its own first month for the same
 * reason `lineHistory` drops a line's.
 */
type HistoryMember = { points: FinanceHistoryPoint[]; yearScoped: boolean; partialStart: boolean };

function memberHistory(key: string, sources: HistorySources, periodMonth: string): HistoryMember {
  const plain = (history: FinanceHistory, yearScoped = false, partialStart = false) => ({
    points: history.points,
    yearScoped,
    partialStart
  });

  if (key.startsWith("utility:")) {
    const accountId = key.slice("utility:".length);
    const entry = sources.book.find(({ account }) => account.id === accountId);
    return plain(entry ? utilitySectionHistory(entry.bills, periodMonth) : { points: [] });
  }

  if (key === "house-sitting") {
    return plain(houseSittingHistory(sources.houseSitting.net, periodMonth), true);
  }

  if (key === "clients") return plain(clientsHistory(sources.clients, periodMonth));

  const line = sources.lines.find((candidate) => candidate.id === key);
  if (!line) return plain({ points: [] });

  const rates = onPaydays(line.rates, paydayWeekdayFor(line.label));
  // **Untrimmed inside a sum.** On its own a line drops a part month at either
  // end, because a half-height point read as the low of a timeline about the
  // *level* of a commitment is a claim the data does not make. Inside a block
  // that same trim would make the line vanish from a month it really was paid
  // in, and the block would dip by the whole of it — a missing member is a worse
  // reading than a partial one. The block drops its own opening month instead,
  // below, when every member that starts there starts part way through it.
  return plain(
    lineHistory(line, periodMonth, { trim: false }),
    false,
    rates.length > 0 && !startsWhole(rates[0].effective_from)
  );
}

/**
 * The sum of a set of rows, month by month.
 *
 * A member is **worth zero in a month it did not exist in**, which is the
 * opposite of the rule one line follows and is right for the same reason: a
 * subscription taken out in May really did add nothing to the block in April,
 * and the block was really smaller then. What a block must never do is read
 * small because a figure is *missing* rather than absent, which is what
 * `yearScoped` guards.
 */
export function sumHistory(
  keys: string[],
  sources: HistorySources,
  periodMonth: string,
  emptyNote: string
): FinanceHistory {
  const members = keys.map((key) => memberHistory(key, sources, periodMonth)).filter((member) => member.points.length > 0);
  if (members.length === 0) return { points: [], note: emptyNote };

  const firstOf = (member: HistoryMember) => member.points[0].periodMonth;
  // The earliest month anything in the block has a figure for — except that a
  // year-scoped member pulls the start forward to its own, since before that the
  // sum would simply be missing one of its parts.
  //
  // Unless it is worth nothing anywhere, which is the case that would otherwise
  // cut the income block back to the current year for a household that has never
  // taken a house-sitting booking. A member with nothing in it cannot be missing
  // from an earlier month, so it has no claim on where the block starts.
  let start = members.map(firstOf).sort()[0];
  members
    .filter((member) => member.yearScoped && member.points.some((point) => point.amount !== 0))
    .forEach((member) => {
      if (firstOf(member) > start) start = firstOf(member);
    });

  const byMonth = new Map<string, number>();
  members.forEach((member) => {
    member.points.forEach((point) => {
      if (point.periodMonth < start) return;
      byMonth.set(point.periodMonth, (byMonth.get(point.periodMonth) ?? 0) + point.amount);
    });
  });

  const points = historyMonths(start, periodMonth).map((month) => ({
    periodMonth: month,
    amount: Math.round((byMonth.get(month) ?? 0) * 100) / 100
  }));

  // The block's own part month: dropped only when every member that opens in it
  // opens part way through, and never when dropping it would leave nothing to
  // draw.
  const opening = members.filter((member) => firstOf(member) === start);
  const partial = opening.length > 0 && opening.every((member) => member.partialStart);
  return { points: partial && points.length > 2 ? points.slice(1) : points };
}

/**
 * What the panel is open on: one line, one block, or a whole side of the month.
 *
 * Three levels, one panel. They differ in what they sum and in nothing else —
 * the stats, the ranges, the chart and the `By home` reading all read a list of
 * months, and a block's list is built the same way a line's is. Anything that
 * needed a second panel would be a second answer to the same question.
 *
 * A block and a side carry **no `yearAmount`**. A typed line annualises off its
 * own rate and cadence, which is exact; a block holding a fortnightly tax, a
 * monthly rent and a metered water bill has no single rate to annualise, and
 * adding per-line run rates to per-line averages gives a figure that matches
 * neither. The panel falls back to the block's own twelve-month average × 12,
 * which is the level the block actually runs at.
 */
export type HistorySubject = {
  kind: "row" | "block" | "side";
  /** A row key, a bucket name, or `in` / `out`. */
  key: string;
  label: string;
  /** What it comes to in the month behind the panel. */
  amount: number;
  /** Which way it moves the month — it decides whether a rise is good news. */
  direction: "in" | "out";
  hint?: string;
  source?: FinanceRow["source"];
  detail?: FinanceRow["detail"];
  yearAmount?: number;
};

/** A row, opened. */
export function rowSubject(row: FinanceRow, direction: "in" | "out"): HistorySubject {
  return {
    kind: "row",
    key: row.key,
    label: row.label,
    amount: row.amount,
    direction,
    hint: row.hint,
    source: row.source,
    detail: row.detail,
    yearAmount: row.yearAmount
  };
}

/** A block, opened — `Needs`, `Subscriptions`, `Tax withheld`. */
export function blockSubject(
  bucket: FinanceBucket,
  title: string,
  amount: number,
  rowCount: number
): HistorySubject {
  return {
    kind: "block",
    key: bucket,
    label: title,
    amount,
    direction: bucketDirection(bucket),
    hint: `${rowCount} ${rowCount === 1 ? "line" : "lines"}`
  };
}

/** A whole side of the month, opened — `Money in`, `Money out`. */
export function sideSubject(
  direction: "in" | "out",
  label: string,
  amount: number,
  blockCount: number
): HistorySubject {
  return {
    kind: "side",
    key: direction,
    label,
    amount,
    direction,
    hint: `${blockCount} ${blockCount === 1 ? "block" : "blocks"}`
  };
}

/** The timeline behind whatever the panel is open on. */
export function subjectHistory(
  subject: HistorySubject,
  sources: HistorySources,
  periodMonth: string
): FinanceHistory {
  if (subject.kind === "row") return rowHistory({ key: subject.key }, sources, periodMonth);

  if (subject.kind === "block") {
    return sumHistory(
      sectionMemberKeys(subject.key as FinanceBucket, sources),
      sources,
      periodMonth,
      "Nothing in this block yet"
    );
  }

  return sumHistory(
    sideMemberKeys(subject.key as "in" | "out", sources),
    sources,
    periodMonth,
    "Nothing here yet"
  );
}

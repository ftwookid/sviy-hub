import type { ClientWithPets } from "@/types/client";
import type { HouseSittingBooking } from "@/types/houseSitting";
import type {
  FinanceBucket,
  FinanceLine,
  FinanceRate,
  PayCadence,
  FinanceRow,
  FinanceSection,
  FinanceSectionKey,
  MonthFinances
} from "@/types/finance";
import { estimateClientMonthlyNet } from "@/lib/clients";
import { addDays, activeBookings, estimateHouseSitting, nightsBetween } from "@/lib/houseSitting";
import { formatCurrency, formatShortDate, monthRange, parseLocalDate, todayInputValue, toInputDate } from "@/lib/formatters";

/**
 * The month, assembled.
 *
 * Everything here is arithmetic over rows somebody else loaded — no queries, no
 * state — because the one thing this page must not get wrong is whether the
 * family is up or down, and that is easiest to trust when it is a pure function
 * of what is on screen.
 */

/** Buckets whose lines are typed in, in the order the sections read. */
export const EDITABLE_BUCKETS: FinanceBucket[] = [
  "Gross Income",
  "Tax Withheld",
  "Deductions",
  "Needs",
  "Subscriptions",
  "Debt",
  "Investments & Savings"
];

/**
 * How each block is named and coloured, in one place.
 *
 * The colour is shared between the composition bar and the block's own row, so a
 * segment can be traced to its row by eye. Two components disagreeing about
 * either the name or the colour would make the bar unreadable, which is the only
 * reason it exists.
 */
export const SECTION_STYLE: Record<
  FinanceSectionKey,
  { title: string; short: string; color: string; text: string }
> = {
  "Gross Income": { title: "Gross income", short: "In", color: "bg-[#5F8C74]", text: "text-[#4A8C6F]" },
  "Tax Withheld": { title: "Tax withheld", short: "Tax", color: "bg-[#8C8579]", text: "text-text-secondary" },
  Deductions: { title: "Deductions", short: "Deducted", color: "bg-accent", text: "text-text-secondary" },
  Needs: { title: "Needs", short: "Needs", color: "bg-[#D8C7A5]", text: "text-text-secondary" },
  Subscriptions: { title: "Subscriptions", short: "Subs", color: "bg-[#8D9DAE]", text: "text-text-secondary" },
  Debt: { title: "Debt", short: "Debt", color: "bg-[#B87B6B]", text: "text-text-secondary" },
  "Investments & Savings": {
    title: "Investments & savings",
    short: "Saved",
    color: "bg-[#7FA890]",
    text: "text-text-secondary"
  }
};

function emptyYear() {
  return Array(12).fill(0) as number[];
}

/**
 * What the regular clients bring in each month.
 *
 * One figure for every month rather than twelve, because a client record says
 * what the arrangement is now — it carries no history of which months were
 * actually worked. Paused clients are excluded: they are not bringing anything
 * in this month.
 */
export function clientMonthlyIncome(clients: ClientWithPets[]) {
  return clients
    .filter((client) => client.status === "Active")
    .reduce((total, client) => total + estimateClientMonthlyNet(client), 0);
}

/**
 * House sitting, spread over the months it was actually slept in.
 *
 * A stay from the 28th to the 3rd earns in two months, so the net is divided by
 * nights and each night lands in its own month. Filing the whole stay under its
 * start date would make a August look richer than it was and September poorer.
 * Cancelled stays earn nothing.
 */
export function houseSittingByMonth(bookings: HouseSittingBooking[], year: number) {
  const net = emptyYear();
  const nights = emptyYear();

  activeBookings(bookings).forEach((booking) => {
    const estimate = estimateHouseSitting({
      startDate: booking.start_date,
      endDate: booking.end_date,
      nightlyRate: Number(booking.nightly_rate),
      paymentMethod: booking.payment_method,
      commissionRate: Number(booking.rover_commission_rate)
    });
    const nightCount = nightsBetween(booking.start_date, booking.end_date);
    const perNight = estimate.net / nightCount;
    const start = parseLocalDate(booking.start_date);

    for (let index = 0; index < nightCount; index += 1) {
      const night = addDays(start, index);
      if (night.getFullYear() !== year) continue;
      net[night.getMonth()] += perNight;
      nights[night.getMonth()] += 1;
    }
  });

  return { net, nights };
}

/**
 * How many times a cadence pays in a month, on average across a year.
 *
 * Bi-weekly is 26 paydays a year, not 24 — two months in every year carry a
 * third paycheck. **This average no longer builds a month**: `amountForMonth`
 * counts the payments that actually land in it, so August 2026 is three
 * paychecks and July is two. What the average is still for is the run rate ("a
 * year" on a row, which is this × 12) and the figure Setup shows beside a line,
 * where it is labelled `avg` so it cannot be read as a promise about any one
 * month. Semi-monthly, which is genuinely twice a month, stays a separate
 * cadence.
 */
export const CADENCE_PER_MONTH: Record<PayCadence, number> = {
  Weekly: 52 / 12,
  "Bi-weekly": 26 / 12,
  "Semi-monthly": 2,
  Monthly: 1,
  Quarterly: 1 / 3,
  Annual: 1 / 12
};

/** How a cadence reads after an amount: "$1,200.00 every 2 weeks". */
export const CADENCE_SUFFIX: Record<PayCadence, string> = {
  Weekly: "a week",
  "Bi-weekly": "every 2 weeks",
  "Semi-monthly": "twice a month",
  Monthly: "a month",
  Quarterly: "every 3 months",
  Annual: "a year"
};

/** Short enough to sit above a 96px amount field as its label. */
export const CADENCE_TAG: Record<PayCadence, string> = {
  Weekly: "A week",
  "Bi-weekly": "2 weeks",
  "Semi-monthly": "2x month",
  Monthly: "A month",
  Quarterly: "Quarter",
  Annual: "A year"
};

export function monthlyFromCadence(amount: number, cadence: PayCadence) {
  // To the cent, and rounded here rather than left to the column, so what the
  // page adds up is exactly what was stored.
  return Math.round(amount * CADENCE_PER_MONTH[cadence] * 100) / 100;
}

/**
 * A rate as the app expects it, whatever the row actually holds.
 *
 * Rows written before the cadence migration have neither column; they were all
 * monthly figures by definition, so that is what they read as.
 */
export function normalizeRate(rate: FinanceRate): FinanceRate {
  const monthly = Number(rate.monthly_amount) || 0;
  const cadence: PayCadence = rate.cadence ?? "Monthly";
  const entered = rate.entered_amount === null || rate.entered_amount === undefined
    ? cadence === "Monthly"
      ? monthly
      : Math.round((monthly / CADENCE_PER_MONTH[cadence]) * 100) / 100
    : Number(rate.entered_amount);

  return { ...rate, monthly_amount: monthly, entered_amount: entered, cadence, effective_to: rate.effective_to ?? null };
}

/** Rates oldest first. Every reader below assumes this order, so it is done once, on load. */
export function sortRates(rates: FinanceRate[]) {
  return rates.map(normalizeRate).sort((a, b) => a.effective_from.localeCompare(b.effective_from));
}

/** The cadence in force today — what a new change to this line most likely is too. */
export function currentCadence(rates: FinanceRate[]): PayCadence {
  const inForce = [...rates].reverse().find((rate) => rate.effective_from <= todayInputValue());
  return (inForce ?? rates[rates.length - 1])?.cadence ?? "Monthly";
}

/**
 * What a line is worth per month on one date.
 *
 * Zero before its first rate starts, and zero again once the rate in force has
 * run out — an ended line is worth nothing, not its last amount forever. A later
 * rate still wins over an earlier one that ended, which is how a line that was
 * stopped and later restarted reads.
 */
export function rateOn(rates: FinanceRate[], dateValue: string) {
  let amount = 0;
  for (const rate of rates) {
    if (rate.effective_from > dateValue) break;
    amount = hasEnded(rate, dateValue) ? 0 : Number(rate.monthly_amount);
  }
  return amount;
}

/** Whether this rate had already run out by the given day. */
function hasEnded(rate: FinanceRate, dateValue: string) {
  return rate.effective_to !== null && rate.effective_to !== undefined && rate.effective_to < dateValue;
}

/**
 * The day a line stopped for good, or null while it is still running.
 *
 * Only the last rate can end a line: an end date on any earlier one is a gap
 * that the next dated change closes.
 */
export function endedOn(rates: FinanceRate[]) {
  const last = rates[rates.length - 1];
  return last?.effective_to ?? null;
}

/**
 * The days a cadence actually pays in one month, counted from an anchor date.
 *
 * This is the whole reason the page can be trusted. A bi-weekly paycheck is 26 a
 * year, and 26 does not divide by 12: anchored on 21 December 2025, 2026 pays
 * twice in most months and **three times in March and August**. Spreading 26/12
 * evenly showed every month as 2.17 paychecks, so the two months with a third
 * one read about $4,100 light and the ten others read a few hundred heavy.
 * Nothing on the page said so, and "am I actually up this month" is the only
 * question it exists to answer.
 *
 * So a month is the payments that land in it, on their real dates.
 */
const CADENCE_DAYS: Partial<Record<PayCadence, number>> = { Weekly: 7, "Bi-weekly": 14 };
const CADENCE_MONTHS: Partial<Record<PayCadence, number>> = { Monthly: 1, Quarterly: 3, Annual: 12 };

/** Whole days since the epoch, DST-proof — a day step must never be 23 hours. */
function dayNumber(date: Date) {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/** The 31st in a 30-day month is that month's last day, not the 1st of the next one. */
function clampDay(year: number, monthIndex: number, day: number) {
  return Math.min(day, new Date(year, monthIndex + 1, 0).getDate());
}

function dateValue(year: number, monthIndex: number, day: number) {
  return toInputDate(new Date(year, monthIndex, day));
}

/**
 * Lines that are paid on a fixed weekday, whatever date gets typed for them.
 *
 * Ivan's W2 lands on a **Thursday**, always, and he does not always remember the
 * exact date the schedule started — he may type the Monday of that week. While
 * months were averaged that cost nothing; now the anchor generates every payday,
 * and four days of error moves the year's two extra paychecks between months
 * (a Sunday anchor put them in March and August, the real Thursday one puts them
 * in April and October). So a date given for this line is read as *the week it
 * falls in*, and the payday is that week's Thursday.
 *
 * Keyed by label, and deliberately narrow: this is one household fact about one
 * paycheck, not a feature. Nothing else in the app has a fixed weekday, and
 * renaming the line turns the rule off — which is the right failure, because the
 * app would then have no reason to believe anything about when it is paid.
 */
const PAYDAY_WEEKDAY: Record<string, number> = {
  // 4 = Thursday, in a week that starts on Sunday.
  "ivan w2": 4
};

export function paydayWeekdayFor(label: string): number | null {
  return PAYDAY_WEEKDAY[label.trim().toLowerCase()] ?? null;
}

/**
 * The line's payday in the week the given date falls in.
 *
 * The week runs Sunday to Saturday, which is what makes 21 December 2025 — a
 * Sunday — mean the Thursday **after** it rather than the one before. A date
 * already on the right weekday is returned untouched.
 */
export function snapToPayday(dateValue: string, weekday: number | null) {
  if (weekday === null) return dateValue;
  const date = parseLocalDate(dateValue);
  const shift = weekday - date.getDay();
  return shift === 0 ? dateValue : toInputDate(addDays(date, shift));
}

/** A line's schedule as its paydays, for lines that have a fixed one. */
function onPaydays(rates: FinanceRate[], weekday: number | null) {
  if (weekday === null) return rates;
  return rates.map((rate) => ({ ...rate, effective_from: snapToPayday(rate.effective_from, weekday) }));
}

/**
 * The date a line's cycle counts from.
 *
 * A raise does **not** restart the cycle — payday is payday whatever the figure
 * on it — so the anchor stays the line's first rate date and a later change only
 * says what each payment is worth. A change of *cadence* does restart it: going
 * from monthly to fortnightly is a new schedule, and it starts on the day it was
 * said to start.
 */
function anchorFor(rates: FinanceRate[], index: number) {
  let anchor = rates[0].effective_from;
  for (let step = 1; step <= index; step += 1) {
    if (rates[step].cadence !== rates[step - 1].cadence) anchor = rates[step].effective_from;
  }
  return anchor;
}

/** Every date this cadence pays inside one month, given where the cycle started. */
function cadenceDatesInMonth(anchorValue: string, cadence: PayCadence, year: number, monthIndex: number) {
  const anchor = parseLocalDate(anchorValue);
  const { start, end } = monthRange(year, monthIndex);
  const period = CADENCE_DAYS[cadence];

  if (period) {
    // Jump straight to the first payment on or after the 1st rather than walking
    // years of fortnights to get there.
    const steps = Math.max(0, Math.ceil((dayNumber(parseLocalDate(start)) - dayNumber(anchor)) / period));
    const dates: string[] = [];
    for (let step = steps; ; step += 1) {
      const value = toInputDate(addDays(anchor, step * period));
      if (value > end) break;
      if (value >= start) dates.push(value);
    }
    return dates;
  }

  if (cadence === "Semi-monthly") {
    // Twice a month is exactly twice a month — the count never varies, only
    // where the two land, which matters when a rate changes mid-month.
    const first = clampDay(year, monthIndex, anchor.getDate());
    const second = clampDay(year, monthIndex, anchor.getDate() + 15);
    return Array.from(new Set([first, second]))
      .sort((a, b) => a - b)
      .map((day) => dateValue(year, monthIndex, day))
      .filter((value) => value >= anchorValue);
  }

  const stride = CADENCE_MONTHS[cadence] ?? 1;
  const monthsSince = (year - anchor.getFullYear()) * 12 + (monthIndex - anchor.getMonth());
  if (monthsSince < 0 || monthsSince % stride !== 0) return [];
  return [dateValue(year, monthIndex, clampDay(year, monthIndex, anchor.getDate()))];
}

export type PaymentOccurrence = { date: string; amount: number };

/**
 * Every payment a line makes in one month, with what each one is worth.
 *
 * Each rate owns the stretch of the month from its own start date until the next
 * rate begins, so a payment is worth whatever was in force on the day it landed.
 * That replaces the old day-by-day blend, which averaged a raise across the whole
 * month — truthful about an amount that accrues daily, and wrong about a
 * paycheck, which is either paid at the old figure or the new one.
 */
export function occurrencesInMonth(
  rates: FinanceRate[],
  year: number,
  monthIndex: number
): PaymentOccurrence[] {
  if (rates.length === 0) return [];
  const { start, end } = monthRange(year, monthIndex);
  const occurrences: PaymentOccurrence[] = [];

  rates.forEach((rate, index) => {
    const next = rates[index + 1];
    const windowStart = rate.effective_from > start ? rate.effective_from : start;
    const nextStarts =
      next && next.effective_from <= end ? toInputDate(addDays(parseLocalDate(next.effective_from), -1)) : end;
    // An end date is inclusive, so it closes the window on its own day. It only
    // ever shortens: a line that stopped on the 12th cannot pay on the 20th
    // whatever the next change says.
    const stops = rate.effective_to ?? null;
    const windowEnd = stops !== null && stops < nextStarts ? stops : nextStarts;
    if (windowStart > windowEnd) return;

    cadenceDatesInMonth(anchorFor(rates, index), rate.cadence, year, monthIndex)
      .filter((value) => value >= windowStart && value <= windowEnd)
      .forEach((value) => occurrences.push({ date: value, amount: Number(rate.entered_amount) }));
  });

  return occurrences.sort((a, b) => a.date.localeCompare(b.date));
}

/** What a line contributes to one month: the payments that land in it, added up. */
export function amountForMonth(rates: FinanceRate[], year: number, monthIndex: number) {
  const total = occurrencesInMonth(rates, year, monthIndex).reduce(
    (sum, occurrence) => sum + occurrence.amount,
    0
  );
  return Math.round(total * 100) / 100;
}

/** The amount in force today — what the setup screen shows as the line's current figure. */
export function currentAmount(rates: FinanceRate[]) {
  return rateOn(rates, todayInputValue());
}

/**
 * What the row says about itself under its figure.
 *
 * The count comes first, because that is the fact a monthly figure cannot carry:
 * "3 payments" is why August is bigger than July, and without it the reader is
 * left to assume the number is wrong.
 */
function lineHint(line: FinanceLine, year: number, monthIndex: number) {
  const rates = line.rates;
  if (rates.length === 0) return "No amount set";

  const { start, end } = monthRange(year, monthIndex);
  const first = rates[0];
  if (first.effective_from > end) return `Starts ${formatShortDate(first.effective_from)}`;

  // A line that stopped before this month is not shown at all (`manualRows`
  // drops it), so this only speaks for the month it stopped in and the ones a
  // future end date has not reached yet.
  const stopped = endedOn(rates);
  if (stopped !== null && stopped < start) return `Ended ${formatShortDate(stopped)}`;
  const ending = stopped !== null && stopped <= end ? `Ends ${formatShortDate(stopped)}` : null;

  const occurrences = occurrencesInMonth(rates, year, monthIndex);
  const cadence = ([...rates].reverse().find((rate) => rate.effective_from <= end) ?? first).cadence;

  // A quarterly bill in a month it is not due, or a line that has been ended.
  if (occurrences.length === 0) {
    if (ending) return ending;
    if (first.effective_from > start) return `From ${formatShortDate(first.effective_from)}`;
    return "Nothing due this month";
  }

  const amounts = Array.from(new Set(occurrences.map((occurrence) => occurrence.amount)));
  const each = `${formatCurrency(amounts[0])} ${CADENCE_SUFFIX[cadence]}`;

  // A rate change part-way through the month: the payments before it and after
  // it are worth different amounts, and hiding that behind one figure is the
  // thing that made the old blend unreadable.
  if (amounts.length > 1) {
    return `${occurrences.length} payments · ${formatCurrency(amounts[0])} then ${formatCurrency(
      amounts[amounts.length - 1]
    )}`;
  }

  if (occurrences.length > 1) return `${occurrences.length} payments · ${each}`;
  if (ending) return `${ending}${cadence === "Monthly" ? "" : ` · ${each}`}`;
  if (cadence !== "Monthly") return `Paid ${formatShortDate(occurrences[0].date)} · ${each}`;
  if (first.effective_from > start) return `From ${formatShortDate(first.effective_from)}`;
  return line.note ?? undefined;
}

function manualRows(lines: FinanceLine[], bucket: FinanceBucket, year: number, monthIndex: number): FinanceRow[] {
  const { start: monthStart } = monthRange(year, monthIndex);

  return lines
    .filter((line) => line.bucket === bucket)
    // A line that stopped before this month started is gone from it, rather than
    // a $0.00 row sitting in every month for the rest of time. That is the whole
    // difference between an end date and the change-it-to-0 it replaces: one
    // says the commitment is over, the other says it is currently free.
    .filter((line) => {
      const stopped = endedOn(line.rates);
      return stopped === null || stopped >= monthStart;
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
    // A fixed-weekday line is read on its paydays. Setup already writes the
    // snapped date, so this is normally a no-op — it is here so that a row
    // written any other way still cannot put the paycheck on a Sunday.
    .map((line) => ({ ...line, rates: onPaydays(line.rates, paydayWeekdayFor(line.label)) }))
    .map((line) => ({
      key: line.id,
      label: line.label,
      amount: amountForMonth(line.rates, year, monthIndex),
      // The rate in force at the end of the month, annualised — 26 fortnightly
      // payments, not this month's two or three times twelve.
      yearAmount: rateOn(line.rates, monthRange(year, monthIndex).end) * 12,
      source: "Manual" as const,
      hint: lineHint(line, year, monthIndex)
    }));
}

/**
 * A block, with its lines biggest first.
 *
 * Not in the order they were typed. A block is read to find out where the money
 * went, and the answer is almost always the top one or two lines — putting them
 * in insertion order means scanning thirteen near-identical figures to find the
 * $654 among the $1.56s. Setup keeps `sort_order`, because that screen is for
 * editing a named line and a list that reshuffles as amounts change is no way to
 * find it.
 */
function sectionOf(
  key: FinanceSection["key"],
  direction: FinanceSection["direction"],
  rows: FinanceRow[]
): FinanceSection {
  return {
    key,
    direction,
    rows: [...rows].sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label)),
    total: rows.reduce((sum, row) => sum + row.amount, 0)
  };
}

export type MonthInputs = {
  year: number;
  lines: FinanceLine[];
  clientIncome: number;
  houseSitting: { net: number[]; nights: number[] };
};

export function buildMonth(monthIndex: number, inputs: MonthInputs): MonthFinances {
  const { lines, clientIncome, houseSitting, year } = inputs;
  const nights = houseSitting.nights[monthIndex] ?? 0;

  const income = sectionOf("Gross Income", "in", [
    ...manualRows(lines, "Gross Income", year, monthIndex),
    {
      key: "clients",
      label: "Yana — Regular clients",
      amount: clientIncome,
      source: "Clients",
      hint: "Current estimate, after Rover's cut"
    },
    {
      key: "house-sitting",
      label: "Yana — House sitting",
      amount: houseSitting.net[monthIndex] ?? 0,
      source: "House Sitting",
      hint: nights === 0 ? "No stays booked" : `${nights} ${nights === 1 ? "night" : "nights"} booked`
    }
  ]);

  // Deductions are typed, like the other four out-blocks: insurance, a
  // repayment, whatever the employer takes that is not tax. The business
  // deduction that used to sit here — spending and miles read off the books —
  // belongs to Taxes and is answered on Reports; a tax total in the middle of a
  // cash-flow page could not be subtracted from a bank balance and left nowhere
  // to record the money that actually leaves the paycheck.
  const sections = [
    income,
    sectionOf("Tax Withheld", "out", manualRows(lines, "Tax Withheld", year, monthIndex)),
    sectionOf("Deductions", "out", manualRows(lines, "Deductions", year, monthIndex)),
    sectionOf("Needs", "out", manualRows(lines, "Needs", year, monthIndex)),
    sectionOf("Subscriptions", "out", manualRows(lines, "Subscriptions", year, monthIndex)),
    sectionOf("Debt", "out", manualRows(lines, "Debt", year, monthIndex)),
    sectionOf("Investments & Savings", "out", manualRows(lines, "Investments & Savings", year, monthIndex))
  ];

  const moneyIn = sections
    .filter((section) => section.direction === "in")
    .reduce((sum, section) => sum + section.total, 0);
  const moneyOut = sections
    .filter((section) => section.direction === "out")
    .reduce((sum, section) => sum + section.total, 0);

  return {
    periodMonth: toInputDate(new Date(year, monthIndex, 1)),
    sections,
    moneyIn,
    moneyOut,
    leftOver: moneyIn - moneyOut
  };
}

export function buildYear(inputs: MonthInputs) {
  return Array.from({ length: 12 }, (_, index) => buildMonth(index, inputs));
}

/** Share of the month's income a section takes. Zero income means no share to show, not a divide by zero. */
export function shareOfIncome(amount: number, moneyIn: number) {
  if (moneyIn <= 0) return 0;
  return Math.min(1, amount / moneyIn);
}

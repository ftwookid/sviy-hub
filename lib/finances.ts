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
 * third paycheck. Spreading 26/12 across the months is the honest average and
 * the only reading a monthly figure can carry; it is not a claim about any one
 * month's bank statement. Semi-monthly, which is genuinely twice a month, is a
 * separate option for exactly that reason.
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

  return { ...rate, monthly_amount: monthly, entered_amount: entered, cadence };
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

/** What a line is worth per month on one date, or 0 before its first rate starts. */
export function rateOn(rates: FinanceRate[], dateValue: string) {
  let amount = 0;
  for (const rate of rates) {
    if (rate.effective_from > dateValue) break;
    amount = Number(rate.monthly_amount);
  }
  return amount;
}

/**
 * What a line contributes to one month.
 *
 * A change part-way through a month is blended across it by day: a W2 that goes
 * from $10,000 to $12,000 on 20 July pays 19 days at the old rate and 12 at the
 * new one, which is what actually lands in the account. Taking whichever rate
 * happened to be in force on the 1st would show July as a flat $10,000 and hide
 * the raise for a month.
 *
 * Day by day rather than by interval arithmetic, deliberately: it is 31
 * iterations, it cannot get a boundary wrong, and this is the number the whole
 * page hangs off.
 */
export function amountForMonth(rates: FinanceRate[], year: number, monthIndex: number) {
  if (rates.length === 0) return 0;

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  let total = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    total += rateOn(rates, toInputDate(new Date(year, monthIndex, day)));
  }
  return total / daysInMonth;
}

/** The amount in force today — what the setup screen shows as the line's current figure. */
export function currentAmount(rates: FinanceRate[]) {
  return rateOn(rates, todayInputValue());
}

/** Changes landing inside a month, ignoring one on the 1st — that starts the month rather than splitting it. */
function midMonthChanges(rates: FinanceRate[], year: number, monthIndex: number) {
  const { start, end } = monthRange(year, monthIndex);
  return rates.filter(
    (rate) =>
      rate.effective_from > start &&
      rate.effective_from <= end &&
      // The very first rate starting mid-month is a line beginning, not a change
      // to blend — it is described as "starts" instead.
      rate !== rates[0]
  );
}

function lineHint(line: FinanceLine, year: number, monthIndex: number) {
  const rates = line.rates;
  if (rates.length === 0) return "No amount set";

  const { start, end } = monthRange(year, monthIndex);
  const first = rates[0];
  if (first.effective_from > end) return `Starts ${formatShortDate(first.effective_from)}`;
  if (first.effective_from > start) return `From ${formatShortDate(first.effective_from)}`;

  const changes = midMonthChanges(rates, year, monthIndex);
  if (changes.length === 1) {
    return `Blended · ${formatCurrency(rateOn(rates, start))} to ${formatCurrency(
      Number(changes[0].monthly_amount)
    )} on ${formatShortDate(changes[0].effective_from)}`;
  }
  if (changes.length > 1) return `Blended · ${changes.length} changes this month`;

  // A figure that is not paid monthly has to say what it is, or the row reads as
  // a number nobody recognises against their own payslip.
  const inForce = [...rates].reverse().find((rate) => rate.effective_from <= end);
  if (inForce && inForce.cadence !== "Monthly") {
    return `${formatCurrency(inForce.entered_amount)} ${CADENCE_SUFFIX[inForce.cadence]}`;
  }

  return line.note ?? undefined;
}

function manualRows(lines: FinanceLine[], bucket: FinanceBucket, year: number, monthIndex: number): FinanceRow[] {
  return lines
    .filter((line) => line.bucket === bucket)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
    .map((line) => ({
      key: line.id,
      label: line.label,
      amount: amountForMonth(line.rates, year, monthIndex),
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

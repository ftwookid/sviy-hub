import type { ClientWithPets } from "@/types/client";
import type { Expense } from "@/types/expense";
import type { HouseSittingBooking } from "@/types/houseSitting";
import type { MileageTrip } from "@/types/mileage";
import type {
  FinanceBucket,
  FinanceLine,
  FinanceRow,
  FinanceSection,
  MonthFinances
} from "@/types/finance";
import { estimateClientMonthlyNet } from "@/lib/clients";
import { addDays, activeBookings, estimateHouseSitting, nightsBetween } from "@/lib/houseSitting";
import { parseLocalDate, toInputDate } from "@/lib/formatters";
import { dateFromTimestamp } from "@/lib/mileage";

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
  "Needs",
  "Debt",
  "Investments & Savings"
];

export const BUCKET_BLURBS: Record<FinanceBucket, string> = {
  "Gross Income": "Before anything is taken out",
  "Tax Withheld": "Already gone before payday",
  Needs: "Rent, food, utilities, insurance",
  Debt: "What the loans and cards take",
  "Investments & Savings": "Put away rather than spent"
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

/** Business spending, by month. Real cash out of a real account, unlike the mileage deduction. */
export function spendByMonth(expenses: Expense[], year: number) {
  const totals = emptyYear();
  expenses.forEach((expense) => {
    const date = parseLocalDate(expense.date);
    if (date.getFullYear() !== year) return;
    totals[date.getMonth()] += Number(expense.amount);
  });
  return totals;
}

/** The mileage deduction, by month. Counted nowhere in the cash flow — see `MonthFinances.mileageDeduction`. */
export function mileageByMonth(trips: MileageTrip[], year: number) {
  const totals = emptyYear();
  trips.forEach((trip) => {
    const date = dateFromTimestamp(trip.start_at);
    if (date.getFullYear() !== year) return;
    totals[date.getMonth()] += Number(trip.deduction_value);
  });
  return totals;
}

function manualRows(lines: FinanceLine[], bucket: FinanceBucket): FinanceRow[] {
  return lines
    .filter((line) => line.bucket === bucket)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
    .map((line) => ({
      key: line.id,
      label: line.label,
      amount: Number(line.monthly_amount),
      source: "Manual" as const,
      lineId: line.id,
      hint: line.note ?? undefined
    }));
}

function sectionOf(
  key: FinanceSection["key"],
  direction: FinanceSection["direction"],
  rows: FinanceRow[]
): FinanceSection {
  return {
    key,
    direction,
    rows,
    total: rows.reduce((sum, row) => (row.informational ? sum : sum + row.amount), 0)
  };
}

export type MonthInputs = {
  year: number;
  lines: FinanceLine[];
  clientIncome: number;
  houseSitting: { net: number[]; nights: number[] };
  spend: number[];
  mileage: number[];
};

export function buildMonth(monthIndex: number, inputs: MonthInputs): MonthFinances {
  const { lines, clientIncome, houseSitting, spend, mileage, year } = inputs;
  const nights = houseSitting.nights[monthIndex] ?? 0;
  const mileageDeduction = mileage[monthIndex] ?? 0;

  const income = sectionOf("Gross Income", "in", [
    ...manualRows(lines, "Gross Income"),
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

  // Business spending is cash; the mileage deduction is not. It rides along as an
  // informational row so the section still reads as the deduction total the
  // Reports page gives, without ever being subtracted from the family's month.
  const deductions = sectionOf("Deductions", "out", [
    {
      key: "business-spend",
      label: "Business spending",
      amount: spend[monthIndex] ?? 0,
      source: "Transactions",
      hint: "From Taxes → Transactions"
    },
    {
      key: "mileage",
      label: "Mileage deduction",
      amount: mileageDeduction,
      source: "Mileage",
      hint: "Lowers the tax bill, not the bank balance",
      informational: true
    }
  ]);

  const sections = [
    income,
    sectionOf("Tax Withheld", "out", manualRows(lines, "Tax Withheld")),
    deductions,
    sectionOf("Needs", "out", manualRows(lines, "Needs")),
    sectionOf("Debt", "out", manualRows(lines, "Debt")),
    sectionOf("Investments & Savings", "out", manualRows(lines, "Investments & Savings"))
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
    leftOver: moneyIn - moneyOut,
    mileageDeduction
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

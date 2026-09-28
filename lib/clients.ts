import type { ClientFormValues, ClientPaymentMethod, ClientWithPets, PetType } from "@/types/client";
import { todayInputValue, toInputDate } from "@/lib/formatters";

export const CLIENT_PAYMENT_METHODS: ClientPaymentMethod[] = ["Rover", "Venmo", "Cash"];
export const PET_TYPES: PetType[] = ["Dog", "Cat", "Bird", "Exotic"];
export const SERVICE_TYPES = ["Dog walking", "House sitting", "Drop-in visit", "Exotic care", "Custom"];
export const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const ROVER_COMMISSION_RATE = 0.2;
export const WEEKS_PER_MONTH = 52 / 12;

export function selectedDaysFromRecord(frequencyLabel: string, visitsPerWeek: number | null) {
  const savedDays = frequencyLabel
    .split(",")
    .map((day) => day.trim())
    .filter((day) => WEEK_DAYS.includes(day));

  if (savedDays.length > 0) return savedDays;
  const count = Math.max(0, Math.min(7, Math.round(visitsPerWeek ?? 0)));
  return WEEK_DAYS.slice(0, count);
}

export function selectedDaysLabel(days: string[]) {
  return days.join(", ");
}

export function estimateClientEarnings(input: {
  pricePerVisit: number;
  visitsPerWeek: number | null;
  paymentMethod: ClientPaymentMethod;
  commissionRate?: number;
}) {
  const visits = input.visitsPerWeek ?? 0;
  const weeklyGross = input.pricePerVisit * visits;
  const monthlyGross = weeklyGross * WEEKS_PER_MONTH;
  const commissionRate = input.commissionRate ?? ROVER_COMMISSION_RATE;
  const commission = input.paymentMethod === "Rover" ? monthlyGross * commissionRate : 0;
  const monthlyNet = monthlyGross - commission;

  return {
    weeklyGross,
    monthlyGross,
    monthlyNet,
    commission,
    taxable: input.paymentMethod !== "Cash"
  };
}

export function estimateClientFromRecord(client: Pick<ClientWithPets, "price_per_visit" | "visits_per_week" | "payment_method" | "rover_commission_rate">) {
  return estimateClientEarnings({
    pricePerVisit: Number(client.price_per_visit),
    visitsPerWeek: client.visits_per_week,
    paymentMethod: client.payment_method,
    commissionRate: Number(client.rover_commission_rate)
  });
}

type TermsRecord = Pick<ClientWithPets, "price_per_visit" | "payment_method" | "frequency_label" | "visits_per_week" | "price_history">;

/** The dated row in force on a day that says something about `field`. */
function termRowOn(client: Pick<ClientWithPets, "price_history">, dateValue: string, field?: "payment_method" | "visit_days") {
  return (client.price_history ?? [])
    .filter((row) => row.effective_date <= dateValue && (!field || row[field]))
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
}

/**
 * What a client was charged on a given day.
 *
 * `price_history` is dated, so a month in the past can be priced at what was
 * actually being charged then rather than at today's figure — which is what lets
 * the Finances timeline draw the regular clients as a real series instead of one
 * estimate repeated.
 */
export function clientPriceOn(
  client: Pick<ClientWithPets, "price_per_visit" | "price_history">,
  dateValue: string
) {
  return Number(termRowOn(client, dateValue)?.price ?? client.price_per_visit);
}

/**
 * How a client was paying on a given day.
 *
 * Dated alongside the price, because moving from Rover to Venmo is exactly the
 * change that decides whether 20% comes off — and it happens on a date, not
 * for all time. The latest dated row that names a method wins; rows written
 * before the method was recorded fall back to the client record.
 */
export function clientPaymentOn(
  client: Pick<ClientWithPets, "payment_method" | "price_history">,
  dateValue: string
): ClientPaymentMethod {
  return termRowOn(client, dateValue, "payment_method")?.payment_method ?? client.payment_method;
}

/** Which weekdays a client was visited on, as of a day. Same fallback rule. */
export function clientDaysOn(
  client: Pick<ClientWithPets, "frequency_label" | "visits_per_week" | "price_history">,
  dateValue: string
) {
  const row = termRowOn(client, dateValue, "visit_days");
  return row?.visit_days
    ? selectedDaysFromRecord(row.visit_days, null)
    : selectedDaysFromRecord(client.frequency_label, client.visits_per_week);
}

/**
 * Everything that decides what a client earns, as it stood on one day.
 *
 * Price, payment method and visit days are one set of terms: each dated row in
 * `price_history` is a change agreed with the client, and a day is earned under
 * whatever was agreed last before it. Nothing about a past day moves when a
 * later change is entered.
 */
export function clientTermsOn(client: TermsRecord, dateValue: string) {
  const days = clientDaysOn(client, dateValue);
  return {
    price: clientPriceOn(client, dateValue),
    paymentMethod: clientPaymentOn(client, dateValue),
    days,
    visitsPerWeek: days.length
  };
}

/**
 * Whether a client was active on a day.
 *
 * `status_history` records every pause with its dates, so a client paused in
 * October still counts in September. A client with no recorded history — the
 * older records — falls back to its current status, which was the only answer
 * available before.
 */
export function clientActiveOn(client: Pick<ClientWithPets, "status" | "status_history">, dateValue: string) {
  const history = client.status_history ?? [];
  if (history.length === 0) return client.status === "Active";

  const entry = history
    .filter((row) => row.start_date <= dateValue && (!row.end_date || row.end_date >= dateValue))
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
  if (entry) return entry.status === "Active";

  // Before the first recorded status the client was on whatever terms it
  // started under; after a closed last entry, it is on its current status.
  const earliest = history.map((row) => row.start_date).sort()[0];
  return dateValue < earliest ? history.find((row) => row.start_date === earliest)?.status === "Active" : client.status === "Active";
}

/** A client's estimate at the terms in force on a day — a monthly rate, not visits counted. */
export function estimateClientOn(client: ClientWithPets, dateValue: string) {
  const terms = clientTermsOn(client, dateValue);
  return estimateClientEarnings({
    pricePerVisit: terms.price,
    visitsPerWeek: terms.visitsPerWeek,
    paymentMethod: terms.paymentMethod,
    commissionRate: Number(client.rover_commission_rate)
  });
}

/**
 * What one client brings into a calendar month, net of Rover.
 *
 * Priced at the terms in force on the month's last day and counted only if the
 * client was on the books and active then. The Finances month row and its
 * timeline both read this, so a change agreed in May steps both in May.
 */
export function clientMonthlyNetIn(client: ClientWithPets, monthEnd: string) {
  if (clientStartDate(client) > monthEnd) return 0;
  if (!clientActiveOn(client, monthEnd)) return 0;
  return estimateClientOn(client, monthEnd).monthlyNet;
}

/**
 * What a client actually earned between two days, visit by visit.
 *
 * Each scheduled visit is priced at the terms of its own day, and Rover's cut
 * comes off only the visits that went through Rover. Paused days earn nothing.
 */
export function clientEarnedBetween(client: ClientWithPets, startValue: string, endValue: string) {
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const commissionRate = Number(client.rover_commission_rate);
  let gross = 0;
  let commission = 0;

  const [sy, sm, sd] = startValue.split("-").map(Number);
  for (let date = new Date(sy, sm - 1, sd); ; date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)) {
    const value = toInputDate(date);
    if (value > endValue) break;
    if (!clientActiveOn(client, value)) continue;
    const terms = clientTermsOn(client, value);
    if (!terms.days.includes(weekDays[date.getDay()])) continue;
    gross += terms.price;
    if (terms.paymentMethod === "Rover") commission += terms.price * commissionRate;
  }

  return { gross, commission, net: gross - commission };
}

/**
 * The earliest day this client can be said to have existed.
 *
 * The first dated price if there is one, and the day the record was created
 * otherwise. A month before it is a month the client was not on the books, and
 * counting them in would draw income that never arrived.
 */
export function clientStartDate(client: Pick<ClientWithPets, "created_at" | "price_history">) {
  const dates = (client.price_history ?? []).map((row) => row.effective_date).sort();
  return dates[0] ?? client.created_at.slice(0, 10);
}

export function currentClientPrice(client: Pick<ClientWithPets, "price_per_visit" | "price_history">) {
  return clientPriceOn(client, todayInputValue());
}

export function currentClientPayment(client: Pick<ClientWithPets, "payment_method" | "price_history">) {
  return clientPaymentOn(client, todayInputValue());
}

export function estimateClientCurrentEarnings(client: ClientWithPets) {
  return estimateClientOn(client, todayInputValue());
}

export function estimateClientMonthlyNet(client: ClientWithPets) {
  return estimateClientCurrentEarnings(client).monthlyNet;
}

/**
 * What the regular clients bring in, at the three horizons worth knowing.
 *
 * Net, like every other earnings figure in the app — Rover's cut is money that
 * never arrives. Weekly and annual are derived from the monthly figure rather
 * than summed separately, so the three numbers can never disagree with each
 * other or with a client card.
 */
export function clientIncomeTotals(clients: ClientWithPets[]) {
  const monthly = clients.reduce((total, client) => total + estimateClientMonthlyNet(client), 0);
  return { weekly: monthly / WEEKS_PER_MONTH, monthly, annual: monthly * 12 };
}

export function defaultClientValues(): ClientFormValues {
  return {
    name: "",
    address: "",
    regular_since: todayInputValue(),
    pets: [],
    payment_method: "Rover",
    status: "Active",
    service_type: "Dog walking",
    custom_service_type: "",
    price_per_visit: "",
    selected_days: [],
    notes: ""
  };
}

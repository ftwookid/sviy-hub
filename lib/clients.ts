import type { ClientFormValues, ClientPaymentMethod, ClientWithPets, PetType } from "@/types/client";
import { todayInputValue } from "@/lib/formatters";

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
  const entry = (client.price_history ?? [])
    .filter((row) => row.effective_date <= dateValue)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];

  return Number(entry?.price ?? client.price_per_visit);
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

export function estimateClientCurrentEarnings(client: ClientWithPets) {
  return estimateClientFromRecord({ ...client, price_per_visit: currentClientPrice(client) });
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

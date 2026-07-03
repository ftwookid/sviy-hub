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

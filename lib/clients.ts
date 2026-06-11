import type { ClientFormValues, ClientPaymentMethod, ClientWithPets, PetType } from "@/types/client";

export const CLIENT_PAYMENT_METHODS: ClientPaymentMethod[] = ["Rover", "Venmo", "Cash"];
export const PET_TYPES: PetType[] = ["Dog", "Cat", "Bird", "Exotic"];
export const SERVICE_TYPES = ["Dog walking", "House sitting", "Drop-in visit", "Exotic care", "Custom"];
export const FREQUENCY_SUGGESTIONS = [
  { label: "daily", visitsPerWeek: 7 },
  { label: "4x/week", visitsPerWeek: 4 },
  { label: "7x/week", visitsPerWeek: 7 },
  { label: "weekly", visitsPerWeek: 1 },
  { label: "monthly", visitsPerWeek: 0.23 }
];

export const ROVER_COMMISSION_RATE = 0.2;
export const WEEKS_PER_MONTH = 52 / 12;

export function parseVisitsPerWeek(value: string) {
  const normalized = value.trim().toLowerCase();
  const suggestion = FREQUENCY_SUGGESTIONS.find((item) => item.label === normalized);
  if (suggestion) return suggestion.visitsPerWeek;

  const explicitPerWeek = normalized.match(/(\d+(?:\.\d+)?)\s*x?\s*\/?\s*week/);
  if (explicitPerWeek) return Number(explicitPerWeek[1]);

  const firstNumber = normalized.match(/\d+(?:\.\d+)?/);
  if (firstNumber) return Number(firstNumber[0]);

  if (normalized.includes("daily")) return 7;
  if (normalized.includes("weekly")) return 1;
  if (normalized.includes("monthly")) return 0.23;
  return null;
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
    pets: [{ name: "", type: "Dog", photoFile: null }],
    payment_method: "Rover",
    status: "Active",
    service_type: "Dog walking",
    custom_service_type: "",
    price_per_visit: "",
    frequency_label: "daily",
    visits_per_week: "7",
    notes: ""
  };
}

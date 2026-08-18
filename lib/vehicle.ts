import { UNRELIABILITY_KINDS, VEHICLE_COST_KINDS } from "@/types/vehicle";
import type { VehicleCost, VehicleCostKind } from "@/types/vehicle";

export function normalizeCostKind(value: string): VehicleCostKind {
  const match = VEHICLE_COST_KINDS.find((kind) => kind.toLowerCase() === value?.toLowerCase());
  return match ?? "Other";
}

export type CarEconomics = {
  miles: number;
  /** Fuel burned covering those miles, priced at what fuel costs today. */
  fuelCost: number;
  /** Everything logged by hand — repairs, insurance, the payment. */
  loggedCost: number;
  totalCost: number;
  costPerMile: number;
  /** Maintenance and repairs only. The reliability number. */
  upkeepCost: number;
  upkeepCount: number;
  upkeepShare: number;
  /**
   * The mileage deduction those miles earn.
   *
   * Held next to `totalCost` so the page can put one against the other: what
   * the driving deducts, against what the car swallows to do it. It is a
   * deduction, not income — the comparison is a ratio to read, not a profit.
   */
  deduction: number;
};

export function carEconomics({
  miles,
  deduction,
  mpg,
  fuelPrice,
  costs
}: {
  miles: number;
  deduction: number;
  mpg: number | null;
  fuelPrice: number | null;
  costs: VehicleCost[];
}): CarEconomics {
  const gallons = mpg && mpg > 0 ? miles / mpg : 0;
  const fuelCost = fuelPrice && fuelPrice > 0 ? gallons * fuelPrice : 0;

  // Fuel is derived from mileage and pump price, so a hand-logged fill-up would
  // count the same gallons twice. Fuel rows stay in the ledger as a record of
  // what was actually spent; only the other kinds feed the cost of a mile.
  const loggedCost = costs
    .filter((cost) => cost.kind !== "Fuel")
    .reduce((sum, cost) => sum + Number(cost.amount), 0);

  const upkeepRows = costs.filter((cost) => UNRELIABILITY_KINDS.includes(cost.kind));
  const upkeepCost = upkeepRows.reduce((sum, cost) => sum + Number(cost.amount), 0);

  const totalCost = fuelCost + loggedCost;
  const costPerMile = miles ? totalCost / miles : 0;

  return {
    miles,
    fuelCost,
    loggedCost,
    totalCost,
    costPerMile,
    upkeepCost,
    upkeepCount: upkeepRows.length,
    upkeepShare: totalCost ? upkeepCost / totalCost : 0,
    deduction
  };
}

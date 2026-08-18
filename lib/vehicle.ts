import { UNRELIABILITY_KINDS, VEHICLE_COST_KINDS } from "@/types/vehicle";
import type { VehicleCost, VehicleCostKind } from "@/types/vehicle";

export function normalizeCostKind(value: string): VehicleCostKind {
  const match = VEHICLE_COST_KINDS.find((kind) => kind.toLowerCase() === value?.toLowerCase());
  return match ?? "Other";
}

export type CarEconomics = {
  /** Fuel burned covering the business miles, priced at what fuel costs today. */
  fuelCost: number;
  /** Everything logged by hand — repairs, insurance, the payment. */
  loggedCost: number;
  totalCost: number;
  costPerMile: number;
  /** What the IRS pays back for those same miles, per mile. */
  ratePerMile: number;
  netPerMile: number;
  netTotal: number;
  /** Maintenance and repairs only, per 1,000 miles. The reliability number. */
  upkeepPerThousandMiles: number;
  upkeepShare: number;
  /**
   * The fuel economy at which a mile would break even. Null when fuel economy
   * is not the problem — the fixed costs alone already outrun the deduction.
   */
  breakEvenMpg: number | null;
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

  const upkeep = costs
    .filter((cost) => UNRELIABILITY_KINDS.includes(cost.kind))
    .reduce((sum, cost) => sum + Number(cost.amount), 0);

  const totalCost = fuelCost + loggedCost;
  const costPerMile = miles ? totalCost / miles : 0;
  const ratePerMile = miles ? deduction / miles : 0;
  const fixedPerMile = miles ? loggedCost / miles : 0;

  const headroom = ratePerMile - fixedPerMile;
  const breakEvenMpg =
    fuelPrice && fuelPrice > 0 && headroom > 0 ? fuelPrice / headroom : null;

  return {
    fuelCost,
    loggedCost,
    totalCost,
    costPerMile,
    ratePerMile,
    netPerMile: ratePerMile - costPerMile,
    netTotal: deduction - totalCost,
    upkeepPerThousandMiles: miles ? (upkeep / miles) * 1000 : 0,
    upkeepShare: totalCost ? upkeep / totalCost : 0,
    breakEvenMpg
  };
}

/** What a different car would cost over the same miles, changing only fuel economy. */
export function savingsAtMpg({
  miles,
  fuelPrice,
  currentMpg,
  targetMpg
}: {
  miles: number;
  fuelPrice: number | null;
  currentMpg: number | null;
  targetMpg: number;
}) {
  if (!fuelPrice || fuelPrice <= 0 || !currentMpg || currentMpg <= 0 || targetMpg <= 0) return null;
  const current = (miles / currentMpg) * fuelPrice;
  const target = (miles / targetMpg) * fuelPrice;
  return { current, target, saved: current - target };
}

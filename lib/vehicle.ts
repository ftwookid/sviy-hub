import { UNRELIABILITY_KINDS, VEHICLE_COST_KINDS } from "@/types/vehicle";
import type { VehicleCost, VehicleCostKind } from "@/types/vehicle";

/**
 * Fallback when a period has no trips to read a rate off.
 * The IRS standard rate is set to approximate what an average car costs to
 * operate per mile, which is what makes it a fair yardstick to judge one car
 * against — see `benchmarkPerMile` below.
 */
const FALLBACK_BENCHMARK = 0.7;

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
   * What an average car costs to run per mile, taken from the IRS standard
   * rate on the trips themselves.
   *
   * This is a **yardstick, not income**. The rate is a deduction: it lowers
   * taxable income, so a mile is worth the rate multiplied by a tax bracket,
   * not the rate itself. Comparing running cost against it answers "is this
   * car dearer than an ordinary car", which is the question — and does not
   * pretend the miles pay a wage.
   */
  benchmarkPerMile: number;
  /** Positive means this car costs more per mile than an average one. */
  vsBenchmark: number;
};

export function carEconomics({
  miles,
  benchmarkPerMile,
  mpg,
  fuelPrice,
  costs
}: {
  miles: number;
  benchmarkPerMile: number;
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
  const benchmark = benchmarkPerMile > 0 ? benchmarkPerMile : FALLBACK_BENCHMARK;

  return {
    miles,
    fuelCost,
    loggedCost,
    totalCost,
    costPerMile,
    upkeepCost,
    upkeepCount: upkeepRows.length,
    upkeepShare: totalCost ? upkeepCost / totalCost : 0,
    benchmarkPerMile: benchmark,
    vsBenchmark: costPerMile - benchmark
  };
}

export type Replacement = {
  /** What the current car costs to run over a year at this rate of driving. */
  currentYearly: number;
  /** What the candidate would cost over the same miles. */
  candidateYearly: number;
  /** Positive means switching saves money. */
  saved: number;
  annualMiles: number;
};

/**
 * What a different car would cost over the same driving.
 *
 * Fuel is recomputed at the candidate's economy, the payment is added, and
 * upkeep is whatever the user expects a newer car to need. Everything is put on
 * an annual footing so a month's view and a year's view give the same answer —
 * a car is a multi-year decision and a single February must not look decisive.
 */
export function compareReplacement({
  miles,
  daysObserved,
  currentTotalCost,
  fuelPrice,
  candidateMpg,
  monthlyPayment,
  yearlyUpkeep
}: {
  miles: number;
  daysObserved: number;
  currentTotalCost: number;
  fuelPrice: number | null;
  candidateMpg: number;
  monthlyPayment: number;
  yearlyUpkeep: number;
}): Replacement | null {
  if (!miles || !daysObserved || !fuelPrice || fuelPrice <= 0 || candidateMpg <= 0) return null;

  const yearScale = 365 / daysObserved;
  const annualMiles = miles * yearScale;
  const currentYearly = currentTotalCost * yearScale;
  const candidateYearly = (annualMiles / candidateMpg) * fuelPrice + monthlyPayment * 12 + yearlyUpkeep;

  return {
    currentYearly,
    candidateYearly,
    saved: currentYearly - candidateYearly,
    annualMiles
  };
}

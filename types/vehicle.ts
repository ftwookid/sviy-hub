export const VEHICLE_COST_KINDS = [
  "Fuel",
  "Maintenance",
  "Repair",
  "Insurance",
  "Registration",
  "Payment",
  "Other"
] as const;

export type VehicleCostKind = (typeof VEHICLE_COST_KINDS)[number];

/** Wear-and-tear spend. The number that says whether the car is reliable. */
export const UNRELIABILITY_KINDS: VehicleCostKind[] = ["Maintenance", "Repair"];

export type VehicleProfile = {
  id: string;
  user_id: string;
  label: string;
  mpg: number | null;
  fuel_price: number | null;
  created_at: string;
  updated_at: string;
};

export type VehicleCost = {
  id: string;
  user_id: string;
  incurred_on: string;
  kind: VehicleCostKind;
  amount: number;
  note: string | null;
  created_at: string;
};

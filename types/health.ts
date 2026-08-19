export type HealthProfile = {
  id: string;
  person_id: string;
  height_in: number | null;
  birth_date: string | null;
  goal_weight_lb: number | null;
  goal_date: string | null;
  created_at: string;
  updated_at: string;
};

export type HealthEntry = {
  id: string;
  person_id: string;
  logged_by: string | null;
  recorded_on: string;
  weight_lb: number | null;
  body_fat_pct: number | null;
  waist_in: number | null;
  chest_in: number | null;
  hips_in: number | null;
  arm_in: number | null;
  thigh_in: number | null;
  note: string | null;
  created_at: string;
};

/** The measurements Body reads, in the order it lists them. */
export const MEASUREMENTS = [
  { key: "chest_in", label: "Chest" },
  { key: "waist_in", label: "Waist" },
  { key: "hips_in", label: "Hips" },
  { key: "arm_in", label: "Arm" },
  { key: "thigh_in", label: "Thigh" }
] as const;

export type MeasurementKey = (typeof MEASUREMENTS)[number]["key"];

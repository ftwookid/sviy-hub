export type MileageUpload = {
  id: string;
  created_at: string;
  user_id: string;
  period_month: string;
  period_start: string;
  period_end: string;
  source_filename: string | null;
  source_hash: string;
  source_csv: string;
  is_complete: boolean;
  is_active: boolean;
  business_trip_count: number;
  business_miles: number;
  deduction_value: number;
};

export type MileageTrip = {
  id: string;
  created_at: string;
  upload_id: string;
  user_id: string;
  start_at: string;
  end_at: string | null;
  start_location: string;
  stop_location: string;
  rate: number;
  miles: number;
  deduction_value: number;
  vehicle: string | null;
  purpose: string | null;
  notes: string | null;
};

export type ParsedMileageTrip = Omit<MileageTrip, "id" | "created_at" | "upload_id" | "user_id">;

export type ParsedMileageFile = {
  periodMonth: string;
  periodStart: string;
  periodEnd: string;
  isComplete: boolean;
  businessMiles: number;
  deductionValue: number;
  trips: ParsedMileageTrip[];
};

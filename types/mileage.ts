export type MileageTrip = {
  id: string;
  upload_id: string;
  user_id: string;
  start_at: string;
  end_at: string | null;
  start_location: string | null;
  stop_location: string | null;
  rate: number;
  miles: number;
  deduction_value: number;
  vehicle: string | null;
  purpose: string | null;
  notes: string | null;
  created_at: string;
};

export type MileageUpload = {
  id: string;
  user_id: string;
  period_month: string;
  original_filename: string;
  content_hash: string;
  raw_csv: string;
  coverage_start: string;
  coverage_end: string;
  is_complete: boolean;
  is_active: boolean;
  business_trip_count: number;
  business_miles: number;
  deduction_value: number;
  uploaded_at: string;
  activated_at: string | null;
};

export type ParsedMileageTrip = Omit<MileageTrip, "id" | "upload_id" | "user_id" | "created_at">;

export type ParsedMileageCsv = {
  periodMonth: string;
  periodLabel: string;
  coverageStart: string;
  coverageEnd: string;
  isComplete: boolean;
  businessTrips: ParsedMileageTrip[];
  businessMiles: number;
  deductionValue: number;
  ignoredTripCount: number;
  allTripCount: number;
};

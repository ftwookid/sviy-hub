import type { ClientPaymentMethod } from "@/types/client";
import type { PetType } from "@/types/client";

export type HouseSittingPet = {
  name: string;
  type: PetType;
};

export type HouseSittingStatus = "Planned" | "Cancelled";

export type HouseSittingCustomer = {
  id: string;
  created_at: string;
  updated_at: string | null;
  user_id: string;
  name: string;
  address: string;
  pet_names: string;
  pets: HouseSittingPet[];
};

export type HouseSittingBooking = {
  id: string;
  created_at: string;
  updated_at: string | null;
  user_id: string;
  customer_id: string | null;
  regular_client_id: string | null;
  customer_name: string;
  address: string;
  pet_names: string;
  pets: HouseSittingPet[];
  payment_method: ClientPaymentMethod;
  start_date: string;
  end_date: string;
  nightly_rate: number;
  rover_commission_rate: number;
  status: HouseSittingStatus;
  notes: string | null;
};

export type HouseSittingCalendarView = "week" | "month" | "year";

export type HouseSittingFormValues = {
  customer_name: string;
  address: string;
  pets: HouseSittingPet[];
  payment_method: ClientPaymentMethod;
  start_date: string;
  end_date: string;
  nightly_rate: string;
};

export type ClientStatus = "Active" | "Paused";
export type ClientPaymentMethod = "Rover" | "Venmo" | "Cash";
export type PetType = "Dog" | "Cat" | "Bird" | "Exotic";

export type Client = {
  id: string;
  created_at: string;
  updated_at: string | null;
  user_id: string;
  name: string;
  address: string;
  payment_method: ClientPaymentMethod;
  status: ClientStatus;
  service_type: string;
  custom_service_type: string | null;
  price_per_visit: number;
  frequency_label: string;
  visits_per_week: number | null;
  notes: string | null;
  rover_commission_rate: number;
};

export type Pet = {
  id: string;
  created_at: string;
  client_id: string;
  user_id: string;
  name: string;
  type: PetType;
  photo_url: string | null;
  photo_filename: string | null;
};

export type ClientWithPets = Client & {
  pets: Pet[];
};

export type StatusHistory = {
  id: string;
  client_id: string;
  status: ClientStatus;
  start_date: string;
  end_date: string | null;
  created_at: string;
};

export type ClientFormPet = {
  id?: string;
  name: string;
  type: PetType;
  photo_url?: string | null;
  photo_filename?: string | null;
  photoFile?: File | null;
};

export type ClientFormValues = {
  name: string;
  address: string;
  pets: ClientFormPet[];
  payment_method: ClientPaymentMethod;
  status: ClientStatus;
  service_type: string;
  custom_service_type: string;
  price_per_visit: string;
  selected_days: string[];
  notes: string;
};

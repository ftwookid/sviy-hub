export type PaymentMethod = "Main card" | "Other card" | "Cash";

export type Expense = {
  id: string;
  created_at: string;
  date: string;
  merchant: string;
  description: string | null;
  amount: number;
  category: string;
  payment_method: PaymentMethod;
  receipt_url: string | null;
  receipt_filename: string | null;
  notes: string | null;
  user_id: string;
};

export type ExpenseFormValues = {
  date: string;
  merchant: string;
  description: string;
  amount: string;
  category: string;
  payment_method: PaymentMethod;
  notes: string;
};

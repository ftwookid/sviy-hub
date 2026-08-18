/**
 * How a transaction was paid: "Cash", or the nickname of a saved card.
 *
 * Free text rather than a fixed union, because the list of cards belongs to the
 * user. Kept as text on the expense rather than a foreign key so deleting a card
 * can never rewrite what an old transaction says it was paid with.
 */
export type PaymentMethod = string;

export type PaymentCard = {
  id: string;
  created_at: string;
  user_id: string;
  nickname: string;
};

export type ExpenseType = "Standard" | "Parking";

export type Expense = {
  id: string;
  created_at: string;
  updated_at: string | null;
  date: string;
  merchant: string;
  description: string | null;
  amount: number;
  category: string;
  payment_method: PaymentMethod;
  expense_type: ExpenseType;
  receipt_id: string | null;
  batch_id: string | null;
  proof_waived: boolean;
  proof_note: string | null;
  /** Legacy single-upload columns. Superseded by receipt_id; kept for old rows. */
  receipt_url: string | null;
  receipt_filename: string | null;
  notes: string | null;
  user_id: string;
};

export type ExpenseWithReceipt = Expense & {
  receipt: Receipt | null;
};

export type Receipt = {
  id: string;
  created_at: string;
  updated_at: string | null;
  user_id: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  storage_path: string | null;
  drive_file_id: string | null;
  drive_link: string | null;
  drive_synced_at: string | null;
  drive_error: string | null;
  period_month: string;
  pruned_at: string | null;
};

export type ExpenseBatchStatus = "Draft" | "Confirmed" | "Discarded";

export type ExpenseBatch = {
  id: string;
  created_at: string;
  user_id: string;
  receipt_id: string | null;
  source: "Parking" | "Standard";
  status: ExpenseBatchStatus;
  scanned_rows: ScannedTransaction[];
  scan_note: string | null;
  confirmed_at: string | null;
};

/** One transaction row proposed by the vision scan, before Yana reviews it. */
export type ScannedTransaction = {
  date: string;
  merchant: string;
  amount: number;
  /** Model's own confidence that it read this row correctly. */
  confidence: "high" | "low";
};

/** A scanned row once it is editable in the review table. */
export type ScanDraftRow = {
  key: string;
  date: string;
  merchant: string;
  amount: string;
  confidence: "high" | "low";
  include: boolean;
};

export type MonthCloseoutStatus = "Open" | "Closed";

export type MonthCloseout = {
  id: string;
  created_at: string;
  updated_at: string | null;
  user_id: string;
  period_month: string;
  status: MonthCloseoutStatus;
  closed_at: string | null;
  note: string | null;
};

export type DriveConnection = {
  connected: boolean;
  googleEmail: string | null;
  rootFolderId: string | null;
  rootFolderName: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

export type ProofState = "Attached" | "Missing" | "Waived";

export type ExpenseFormValues = {
  date: string;
  merchant: string;
  description: string;
  amount: string;
  category: string;
  payment_method: PaymentMethod;
  notes: string;
};

export type StatementImportStatus =
  | "Parsing"
  | "Review"
  | "Imported"
  | "Failed"
  | "Discarded";

export type RowDecision = "Include" | "Flag" | "Exclude";
export type RowDirection = "Debit" | "Credit";
export type RowSource = "Statement" | "Manual";
export type RowConfidence = "high" | "low";

/**
 * Arithmetic cross-check of what the scan pulled out against the totals the
 * statement prints on itself. `balanced` is null when the statement never
 * printed a total to check against.
 */
export type StatementReconciliation = {
  statedTotalDebits: number | null;
  statedTotalCredits: number | null;
  extractedTotalDebits: number;
  extractedTotalCredits: number;
  balanced: boolean | null;
  /** Second-pass audit disagreed with the first read and changed rows. */
  auditAdjusted: boolean;
  notes: string;
};

export type StatementImport = {
  id: string;
  created_at: string;
  updated_at: string | null;
  user_id: string;

  filename: string;
  byte_size: number;
  storage_path: string | null;

  institution: string | null;
  account_label: string | null;
  period_start: string | null;
  period_end: string | null;
  period_month: string | null;

  status: StatementImportStatus;
  parse_error: string | null;

  model: string | null;
  reconciliation: StatementReconciliation | Record<string, never>;

  imported_at: string | null;
};

export type StatementImportRow = {
  id: string;
  created_at: string;
  updated_at: string | null;
  import_id: string;
  user_id: string;

  row_index: number;

  date: string;
  description: string;
  merchant: string;
  amount: number;
  direction: RowDirection;

  category: string | null;
  notes: string | null;
  receipt_id: string | null;

  decision: RowDecision;
  confidence: RowConfidence;
  auto_applied: boolean;

  source: RowSource;
  expense_id: string | null;
};

export type MerchantRule = {
  id: string;
  created_at: string;
  updated_at: string | null;
  user_id: string;

  match_key: string;
  sample_description: string | null;
  merchant: string | null;
  category: string | null;
  decision: "Include" | "Exclude";
  notes: string | null;

  times_applied: number;
  last_used_at: string | null;
};

/** One transaction exactly as the model reports it, before any of our cleanup. */
export type ExtractedTransaction = {
  date: string;
  description: string;
  merchant: string;
  amount: number;
  direction: RowDirection;
  confidence: RowConfidence;
  page: number;
};

export type ExtractedStatement = {
  institution: string;
  accountLabel: string;
  periodStart: string;
  periodEnd: string;
  /** -1 when the statement does not print this total. */
  statedTotalDebits: number;
  statedTotalCredits: number;
  pageCount: number;
  notes: string;
};

export type ExtractionResult = {
  statement: ExtractedStatement;
  transactions: ExtractedTransaction[];
};

export type AuditResult = ExtractionResult & {
  audit: {
    agrees: boolean;
    notes: string;
  };
};

export type ParseStatementResponse = {
  importId: string;
};

import type { ProofState } from "@/types/expense";

/**
 * One vendor report standing in as proof for many transactions.
 *
 * A month of parking is fifty $2.10 charges in the books and one spreadsheet
 * from the city that accounts for all of them. The sheet is uploaded once,
 * matched against the transactions it covers, and attached to every one of them
 * as the same receipt.
 */

/** How a spreadsheet's columns map onto the fields a line needs. */
export type SheetColumnMap = {
  vendor: string;
  headerRow: number;
  firstDataRow: number;
  dateColumn: number;
  amountColumn: number;
  descriptionColumns: number[];
  notes: string;
};

/** One charge on the report, once it has been read out of the file. */
export type ProofSheetLine = {
  /** Row number in the file, so an unmatched line can be pointed at. */
  row: number;
  date: string;
  amount: number;
  description: string;
};

export type ProofSheetExpense = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  category: string;
  proof: ProofState;
};

export type ProofSheetMatch = {
  line: ProofSheetLine;
  expense: ProofSheetExpense;
  /** Days between the charge on the report and the transaction in the books. */
  dayGap: number;
};

export type ProofSheetScan = {
  vendor: string;
  lineCount: number;
  matches: ProofSheetMatch[];
  /** Lines on the report with no transaction in the books to attach them to. */
  unmatchedCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  notes: string;
};

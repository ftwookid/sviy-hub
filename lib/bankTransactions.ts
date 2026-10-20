import { periodMonthBounds } from "@/lib/expenses";
import { supabase } from "@/lib/supabase";
import type { BankCategory, BankProject, BankTransaction } from "@/types/bankTransaction";

/**
 * Browser-side reads and writes for posted bank transactions.
 *
 * A missing table is a setup notice rather than an error, the same way the
 * standing figures and the utility bills report a migration that has not been
 * run yet. The importer that fills the table does not live here.
 */

const MIGRATION = "supabase/bank-transactions-schema.sql";

const SETUP_MESSAGE = `Bank transactions are not ready yet. Run ${MIGRATION} in Supabase.`;

function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  // PostgREST reports a table it has never seen from its schema cache
  // (PGRST205) before Postgres gets to say undefined_table (42P01).
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return /bank_transactions/i.test(message) && /(does not exist|could not find)/i.test(message);
}

type BankTransactionRow = Omit<BankTransaction, "amount" | "notes"> & {
  amount: number | string;
  notes: string | null;
};

function asTransaction(row: BankTransactionRow): BankTransaction {
  return {
    ...row,
    amount: Number(row.amount),
    notes: row.notes ?? null,
    merchant: row.merchant ?? "",
    account_label: row.account_label ?? ""
  };
}

export async function loadBankTransactions(periodMonth: string): Promise<{
  rows: BankTransaction[];
  setupNeeded: boolean;
  setupMessage: string;
}> {
  if (!supabase) return { rows: [], setupNeeded: false, setupMessage: "" };

  const { start, end } = periodMonthBounds(periodMonth);
  const { data, error } = await supabase
    .from("bank_transactions")
    .select("*")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: false })
    .order("id", { ascending: true });

  if (error) {
    if (isMissingTable(error)) return { rows: [], setupNeeded: true, setupMessage: SETUP_MESSAGE };
    throw new Error(error.message);
  }

  return {
    rows: ((data ?? []) as BankTransactionRow[]).map(asTransaction),
    setupNeeded: false,
    setupMessage: ""
  };
}

/**
 * The only write the screen makes: the category or the project on one row.
 *
 * The bank-sourced columns stay with the importer. A re-import that upserts
 * on `external_id` should not include these two, or this edit is undone the
 * next time the feed runs.
 */
export async function updateBankTransaction(
  id: string,
  patch: { category?: BankCategory; project?: BankProject }
) {
  if (!supabase) return;

  const { error } = await supabase
    .from("bank_transactions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    if (isMissingTable(error)) throw new Error(SETUP_MESSAGE);
    throw new Error(error.message);
  }
}

/** Spent, what arrived, and the difference. Totals of the rows passed in. */
export function bankTransactionTotals(rows: Pick<BankTransaction, "amount">[]) {
  let spent = 0;
  let cameIn = 0;
  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    if (amount > 0) spent += amount;
    else if (amount < 0) cameIn += -amount;
  }
  return { spent, cameIn, net: cameIn - spent };
}

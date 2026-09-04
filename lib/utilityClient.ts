import { supabase } from "@/lib/supabase";
import type { UtilityAccount, UtilityBill, UtilityBucket } from "@/types/utility";

/**
 * Browser-side reads and writes for the metered bills.
 *
 * A missing table is a setup notice rather than an error, the same way the
 * standing figures, the vehicle and the import sections do it: opening Finances
 * before the migration has run explains itself, and every other figure on the
 * month still reads.
 */

const SETUP_MESSAGE = "Utilities need their tables. Run supabase/utilities-schema.sql in Supabase.";

const TABLES = ["utility_accounts", "utility_bills"];

/**
 * A table PostgREST has never seen is `PGRST205`, before Postgres gets as far as
 * `42P01`; an embedded select against a missing one fails earlier still, as a
 * missing relationship.
 */
export function isMissingUtilityTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST200") return true;
  const message = error.message ?? "";
  return TABLES.some((table) => message.includes(table)) && /(does not exist|could not find)/i.test(message);
}

/** The bucket check constraint: a bucket the app offers and the database has not learned. */
function isUnknownBucket(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "23514" && /utility_accounts_bucket_check/.test(error.message ?? "");
}

function reportable(error: { code?: string; message?: string } | null) {
  if (!error) return null;
  if (isMissingUtilityTable(error)) return new Error(SETUP_MESSAGE);
  if (isUnknownBucket(error)) return new Error(`That bucket is not one utilities can go in. Run ${SETUP_MESSAGE}`);
  return new Error(error.message ?? "Could not save that");
}

export async function loadUtilities(): Promise<{
  accounts: UtilityAccount[];
  bills: UtilityBill[];
  setupNeeded: boolean;
  setupMessage: string;
}> {
  const empty = { accounts: [], bills: [], setupNeeded: false, setupMessage: "" };
  if (!supabase) return empty;

  const [accountResult, billResult] = await Promise.all([
    supabase.from("utility_accounts").select("*").order("sort_order", { ascending: true }),
    supabase.from("utility_bills").select("*").order("period_month", { ascending: true })
  ]);

  const error = accountResult.error ?? billResult.error;
  if (error) {
    if (isMissingUtilityTable(error)) return { ...empty, setupNeeded: true, setupMessage: SETUP_MESSAGE };
    throw new Error(error.message);
  }

  return {
    accounts: (accountResult.data ?? []) as UtilityAccount[],
    // Amounts arrive as strings from a numeric column, and every reader of them
    // does arithmetic — so they are numbers by the time they leave here.
    bills: ((billResult.data ?? []) as UtilityBill[]).map((bill) => ({ ...bill, amount: Number(bill.amount) })),
    setupNeeded: false,
    setupMessage: ""
  };
}

export async function addUtilityAccount(input: {
  userId: string;
  name: string;
  bucket: UtilityBucket;
  existingCount: number;
}) {
  if (!supabase) return;
  const { error } = await supabase.from("utility_accounts").insert({
    user_id: input.userId,
    name: input.name,
    bucket: input.bucket,
    sort_order: input.existingCount
  });
  const failure = reportable(error);
  if (failure) throw failure;
}

export async function updateUtilityAccount(id: string, patch: { name?: string; bucket?: UtilityBucket }) {
  if (!supabase) return;
  const { error } = await supabase
    .from("utility_accounts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  const failure = reportable(error);
  if (failure) throw failure;
}

/** Deleting an account takes its bills with it — the cascade is on the foreign key. */
export async function deleteUtilityAccount(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from("utility_accounts").delete().eq("id", id);
  const failure = reportable(error);
  if (failure) throw failure;
}

/**
 * Enter or correct one month's bill.
 *
 * An upsert on `(account_id, period_month)`, so re-entering a month fixes that
 * bill rather than stacking a second one against the same month — which would
 * double the month on the page and leave no way to tell which was meant.
 */
export async function setUtilityBill(input: {
  userId: string;
  accountId: string;
  periodMonth: string;
  amount: number;
  note?: string | null;
}) {
  if (!supabase) return;
  const { error } = await supabase.from("utility_bills").upsert(
    {
      account_id: input.accountId,
      user_id: input.userId,
      period_month: input.periodMonth,
      amount: input.amount,
      note: input.note ?? null
    },
    { onConflict: "account_id,period_month" }
  );
  const failure = reportable(error);
  if (failure) throw failure;
}

export async function deleteUtilityBill(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from("utility_bills").delete().eq("id", id);
  const failure = reportable(error);
  if (failure) throw failure;
}

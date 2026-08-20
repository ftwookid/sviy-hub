import { supabase } from "@/lib/supabase";
import type { FinanceBucket, FinanceLine } from "@/types/finance";

/**
 * Browser-side reads and writes for the standing household figures.
 *
 * A missing table is reported as a setup notice rather than an error, the same
 * way the vehicle and import sections do it, so opening Finances before the
 * migration has run explains itself instead of looking broken.
 */

export const FINANCES_SETUP_MESSAGE =
  "The finances table is not ready yet. Run supabase/finances-schema.sql in Supabase.";

function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  // Two codes, because a table this app has never seen is reported by PostgREST
  // from its own schema cache (PGRST205, "Could not find the table") long before
  // Postgres itself gets a chance to say undefined_table (42P01).
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /finance_lines/.test(error.message ?? "") && /(does not exist|could not find)/i.test(error.message ?? "");
}

export async function loadFinanceLines(): Promise<{ lines: FinanceLine[]; setupNeeded: boolean }> {
  if (!supabase) return { lines: [], setupNeeded: false };

  const { data, error } = await supabase
    .from("finance_lines")
    .select("*")
    .order("bucket", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    if (isMissingTable(error)) return { lines: [], setupNeeded: true };
    throw new Error(error.message);
  }

  return { lines: (data ?? []) as FinanceLine[], setupNeeded: false };
}

export async function addFinanceLine(input: {
  userId: string;
  bucket: FinanceBucket;
  label: string;
  amount: number;
  existingCount: number;
}) {
  if (!supabase) return;

  const { error } = await supabase.from("finance_lines").insert({
    user_id: input.userId,
    bucket: input.bucket,
    label: input.label,
    monthly_amount: input.amount,
    sort_order: input.existingCount
  });
  if (error) throw new Error(isMissingTable(error) ? FINANCES_SETUP_MESSAGE : error.message);
}

export async function updateFinanceLine(id: string, patch: { label?: string; amount?: number }) {
  if (!supabase) return;

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.label !== undefined) payload.label = patch.label;
  if (patch.amount !== undefined) payload.monthly_amount = patch.amount;

  const { error } = await supabase.from("finance_lines").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteFinanceLine(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from("finance_lines").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

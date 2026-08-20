import { supabase } from "@/lib/supabase";
import { sortRates } from "@/lib/finances";
import type { FinanceBucket, FinanceLine, FinanceRate } from "@/types/finance";

/**
 * Browser-side reads and writes for the standing household figures.
 *
 * A missing table is reported as a setup notice rather than an error, the same
 * way the vehicle and import sections do it, so opening Finances before a
 * migration has run explains itself instead of looking broken.
 */

/**
 * Which migration to point at, most specific first.
 *
 * Order matters. A missing rates table is reported as a missing *relationship*
 * — "Could not find a relationship between 'finance_lines' and
 * 'finance_line_rates'" — which names both tables, so checking the older one
 * first sent the reader to a migration they had already run.
 */
const MIGRATIONS: Array<[table: string, file: string]> = [
  ["finance_line_rates", "supabase/finance-rates-schema.sql"],
  ["finance_lines", "supabase/finances-schema.sql"]
];

function setupMessageFor(error: { message?: string } | null) {
  const message = error?.message ?? "";
  const match = MIGRATIONS.find(([table]) => message.includes(table)) ?? MIGRATIONS[0];
  return `The finances tables are not ready yet. Run ${match[1]} in Supabase.`;
}

function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  // Three codes. A table this app has never seen is reported by PostgREST from
  // its own schema cache (PGRST205) long before Postgres gets to say
  // undefined_table (42P01), and an embedded select against a table that is not
  // there fails earlier still, as a missing relationship (PGRST200).
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST200") return true;
  const message = error.message ?? "";
  return (
    MIGRATIONS.some(([table]) => message.includes(table)) && /(does not exist|could not find)/i.test(message)
  );
}

export async function loadFinanceLines(): Promise<{
  lines: FinanceLine[];
  setupNeeded: boolean;
  setupMessage: string;
}> {
  if (!supabase) return { lines: [], setupNeeded: false, setupMessage: "" };

  const { data, error } = await supabase
    .from("finance_lines")
    .select("*, finance_line_rates(*)")
    .order("bucket", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    if (isMissingTable(error)) {
      return { lines: [], setupNeeded: true, setupMessage: setupMessageFor(error) };
    }
    throw new Error(error.message);
  }

  const lines = ((data ?? []) as Array<Omit<FinanceLine, "rates"> & { finance_line_rates: FinanceRate[] | null }>).map(
    ({ finance_line_rates, ...line }) => ({ ...line, rates: sortRates(finance_line_rates ?? []) })
  );

  return { lines, setupNeeded: false, setupMessage: "" };
}

function reportable(error: { code?: string; message?: string } | null) {
  if (!error) return null;
  return new Error(isMissingTable(error) ? setupMessageFor(error) : error.message ?? "Could not save that");
}

/**
 * A new line and its opening amount are one action.
 *
 * A line with no rate contributes nothing and reads as "No amount set", which is
 * a state worth handling but not one worth making somebody pass through.
 */
export async function addFinanceLine(input: {
  userId: string;
  bucket: FinanceBucket;
  label: string;
  amount: number;
  effectiveFrom: string;
  existingCount: number;
}) {
  if (!supabase) return;

  const { data, error } = await supabase
    .from("finance_lines")
    .insert({
      user_id: input.userId,
      bucket: input.bucket,
      label: input.label,
      sort_order: input.existingCount
    })
    .select("id")
    .single();

  const insertError = reportable(error);
  if (insertError) throw insertError;
  if (!data) return;

  await setFinanceRate({
    userId: input.userId,
    lineId: data.id as string,
    effectiveFrom: input.effectiveFrom,
    amount: input.amount
  });
}

export async function renameFinanceLine(id: string, label: string) {
  if (!supabase) return;
  const { error } = await supabase
    .from("finance_lines")
    .update({ label, updated_at: new Date().toISOString() })
    .eq("id", id);
  const failure = reportable(error);
  if (failure) throw failure;
}

/** Deleting a line takes its schedule with it — the cascade is on the foreign key. */
export async function deleteFinanceLine(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from("finance_lines").delete().eq("id", id);
  const failure = reportable(error);
  if (failure) throw failure;
}

/**
 * Set what a line is worth from a date.
 *
 * An upsert on `(line_id, effective_from)`, so entering the same date twice
 * corrects that change rather than stacking a second one on the same day.
 */
export async function setFinanceRate(input: {
  userId: string;
  lineId: string;
  effectiveFrom: string;
  amount: number;
}) {
  if (!supabase) return;

  const { error } = await supabase.from("finance_line_rates").upsert(
    {
      line_id: input.lineId,
      user_id: input.userId,
      effective_from: input.effectiveFrom,
      monthly_amount: input.amount
    },
    { onConflict: "line_id,effective_from" }
  );
  const failure = reportable(error);
  if (failure) throw failure;
}

export async function deleteFinanceRate(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from("finance_line_rates").delete().eq("id", id);
  const failure = reportable(error);
  if (failure) throw failure;
}

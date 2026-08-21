import { supabase } from "@/lib/supabase";
import { monthlyFromCadence, sortRates } from "@/lib/finances";
import type { FinanceBucket, FinanceLine, FinanceRate, PayCadence } from "@/types/finance";

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

const CADENCE_MIGRATION = "The pay cadence needs its column. Run supabase/finance-cadence-schema.sql in Supabase.";

const BUCKET_MIGRATION =
  "Deductions is not a bucket in the database yet. Run supabase/finance-deductions-bucket-schema.sql in Supabase.";

/**
 * The bucket list lives in a check constraint, so a bucket the app knows about
 * and the database does not fails as a constraint violation — which reads as
 * "violates check constraint finance_lines_bucket_check" and names no fix.
 */
function isUnknownBucket(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "23514" && /finance_lines_bucket_check/.test(error.message ?? "");
}

/** PostgREST rejects an unknown column with PGRST204 before the request reaches Postgres. */
function isMissingCadenceColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    (error.code === "PGRST204" || error.code === "42703" || /column/i.test(message)) &&
    /cadence|entered_amount/.test(message)
  );
}

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
  cadence: PayCadence;
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

  if (isUnknownBucket(error)) throw new Error(BUCKET_MIGRATION);

  const insertError = reportable(error);
  if (insertError) throw insertError;
  if (!data) return;

  await setFinanceRate({
    userId: input.userId,
    lineId: data.id as string,
    effectiveFrom: input.effectiveFrom,
    amount: input.amount,
    cadence: input.cadence
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
  /** What was typed, at `cadence` — not the monthly figure, which is derived here. */
  amount: number;
  cadence: PayCadence;
}) {
  if (!supabase) return;

  const row = {
    line_id: input.lineId,
    user_id: input.userId,
    effective_from: input.effectiveFrom,
    monthly_amount: monthlyFromCadence(input.amount, input.cadence)
  };

  const { error } = await supabase
    .from("finance_line_rates")
    .upsert({ ...row, entered_amount: input.amount, cadence: input.cadence }, { onConflict: "line_id,effective_from" });

  if (isMissingCadenceColumn(error)) {
    // Before the cadence migration there is nowhere to record one, but a monthly
    // figure loses nothing by being written to the old shape — so a monthly
    // amount still saves, and only a cadence that would be silently dropped is
    // refused.
    if (input.cadence !== "Monthly") throw new Error(CADENCE_MIGRATION);
    const retry = await supabase
      .from("finance_line_rates")
      .upsert(row, { onConflict: "line_id,effective_from" });
    const retryFailure = reportable(retry.error);
    if (retryFailure) throw retryFailure;
    return;
  }

  const failure = reportable(error);
  if (failure) throw failure;
}

/**
 * Correct a change that is already there — its date, its amount, its cadence.
 *
 * Separate from `setFinanceRate` because that one is keyed on the date: entering
 * the same date twice corrects it, but a typo *in* the date could only ever be
 * fixed by deleting the row and retyping it, which is a strange thing to ask of
 * somebody who can see the wrong figure in front of them.
 */
export async function updateFinanceRate(input: {
  id: string;
  effectiveFrom: string;
  amount: number;
  cadence: PayCadence;
}) {
  if (!supabase) return;

  const patch = {
    effective_from: input.effectiveFrom,
    monthly_amount: monthlyFromCadence(input.amount, input.cadence),
    entered_amount: input.amount,
    cadence: input.cadence
  };

  const { error } = await supabase.from("finance_line_rates").update(patch).eq("id", input.id);

  // One change per line per date, so moving a change onto a date that already
  // has one is a collision worth naming rather than a failed save.
  if (error?.code === "23505") {
    throw new Error("This line already has a change on that date. Edit that one instead.");
  }
  if (isMissingCadenceColumn(error)) throw new Error(CADENCE_MIGRATION);

  const failure = reportable(error);
  if (failure) throw failure;
}

export async function deleteFinanceRate(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from("finance_line_rates").delete().eq("id", id);
  const failure = reportable(error);
  if (failure) throw failure;
}

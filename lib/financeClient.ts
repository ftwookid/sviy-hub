import { supabase } from "@/lib/supabase";
import { monthlyFromCadence, sortRates } from "@/lib/finances";
import type { FinanceBucket, FinanceHome, FinanceLine, FinanceRate, PayCadence } from "@/types/finance";

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

const END_DATE_MIGRATION =
  "An end date needs its column. Run supabase/finance-rate-end-schema.sql in Supabase.";

/**
 * The bucket list lives in a check constraint, so every bucket the app learns
 * about arrives with a migration of its own — and the message has to name the
 * right one, or it sends the reader to a file they have already run.
 */
const BUCKET_MIGRATIONS: Partial<Record<FinanceBucket, string>> = {
  Deductions: "supabase/finance-deductions-bucket-schema.sql",
  Subscriptions: "supabase/finance-subscriptions-bucket-schema.sql"
};

function bucketMigrationMessage(bucket: FinanceBucket) {
  const file = BUCKET_MIGRATIONS[bucket] ?? "supabase/finances-schema.sql";
  return `${bucket} is not a bucket in the database yet. Run ${file} in Supabase.`;
}

/** A bucket the app knows and the database does not fails as a constraint violation. */
function isUnknownBucket(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "23514" && /finance_lines_bucket_check/.test(error.message ?? "");
}

/** PostgREST rejects an unknown column with PGRST204 before the request reaches Postgres. */
function isMissingColumn(error: { code?: string; message?: string } | null, pattern: RegExp) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    (error.code === "PGRST204" || error.code === "42703" || /column/i.test(message)) && pattern.test(message)
  );
}

function isMissingCadenceColumn(error: { code?: string; message?: string } | null) {
  return isMissingColumn(error, /cadence|entered_amount/);
}

function isMissingEndColumn(error: { code?: string; message?: string } | null) {
  return isMissingColumn(error, /effective_to/);
}

/** The range check: an end date before the day the amount starts. */
function isBackwardsRange(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "23514" && /finance_line_rates_range_check/.test(error.message ?? "");
}

const BACKWARDS_RANGE = "An end date cannot come before the date the amount starts.";

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
  effectiveTo?: string | null;
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

  if (isUnknownBucket(error)) throw new Error(bucketMigrationMessage(input.bucket));

  const insertError = reportable(error);
  if (insertError) throw insertError;
  if (!data) return;

  await setFinanceRate({
    userId: input.userId,
    lineId: data.id as string,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
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
  /** The last day it is paid, inclusive. Null means the line is still running. */
  effectiveTo?: string | null;
}) {
  if (!supabase) return;

  const row = {
    line_id: input.lineId,
    user_id: input.userId,
    effective_from: input.effectiveFrom,
    monthly_amount: monthlyFromCadence(input.amount, input.cadence)
  };
  const withCadence = { ...row, entered_amount: input.amount, cadence: input.cadence };
  const options = { onConflict: "line_id,effective_from" };

  let { error } = await supabase
    .from("finance_line_rates")
    .upsert({ ...withCadence, effective_to: input.effectiveTo ?? null }, options);

  // Same rule as the cadence column below: a figure with no end date loses
  // nothing by being written to the older shape, and only an end date that
  // would be silently dropped is refused.
  if (isMissingEndColumn(error)) {
    if (input.effectiveTo) throw new Error(END_DATE_MIGRATION);
    ({ error } = await supabase.from("finance_line_rates").upsert(withCadence, options));
  }

  if (isMissingCadenceColumn(error)) {
    // Before the cadence migration there is nowhere to record one, but a monthly
    // figure loses nothing by being written to the old shape — so a monthly
    // amount still saves, and only a cadence that would be silently dropped is
    // refused.
    if (input.cadence !== "Monthly") throw new Error(CADENCE_MIGRATION);
    ({ error } = await supabase.from("finance_line_rates").upsert(row, options));
  }

  if (isBackwardsRange(error)) throw new Error(BACKWARDS_RANGE);

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
  effectiveTo?: string | null;
}) {
  if (!supabase) return;

  const patch = {
    effective_from: input.effectiveFrom,
    monthly_amount: monthlyFromCadence(input.amount, input.cadence),
    entered_amount: input.amount,
    cadence: input.cadence
  };

  let { error } = await supabase
    .from("finance_line_rates")
    .update({ ...patch, effective_to: input.effectiveTo ?? null })
    .eq("id", input.id);

  // Clearing an end date that was never storable is a no-op, so it retries
  // without the column rather than sending the reader to a migration for a
  // change that does not need it.
  if (isMissingEndColumn(error)) {
    if (input.effectiveTo) throw new Error(END_DATE_MIGRATION);
    ({ error } = await supabase.from("finance_line_rates").update(patch).eq("id", input.id));
  }

  // One change per line per date, so moving a change onto a date that already
  // has one is a collision worth naming rather than a failed save.
  if (error?.code === "23505") {
    throw new Error("This line already has a change on that date. Edit that one instead.");
  }
  if (isBackwardsRange(error)) throw new Error(BACKWARDS_RANGE);
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

/**
 * Where the household has lived.
 *
 * Its own migration, so its own notice: the rest of Finances reads perfectly
 * without it, and only the chart's `By home` range has nothing to show. The
 * table is deliberately joined to nothing, so a failure to load it can never
 * take a figure down with it — homes come back empty and every other range on
 * every chart still draws.
 */
const HOMES_MIGRATION = "supabase/finance-homes-schema.sql";

function isMissingHomes(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /finance_homes/.test(error.message ?? "") && /(does not exist|could not find)/i.test(error.message ?? "");
}

function homesFailure(error: { code?: string; message?: string } | null) {
  if (!error) return null;
  if (isMissingHomes(error)) {
    return new Error(`Homes need their table. Run ${HOMES_MIGRATION} in Supabase.`);
  }
  // Two homes on one day: the month would belong to whichever row happened to
  // sort first, so the database refuses and the message says what to do.
  if (error.code === "23505") return new Error("A home already starts on that date.");
  return new Error(error.message ?? "Could not save that");
}

export async function loadFinanceHomes(): Promise<{
  homes: FinanceHome[];
  setupNeeded: boolean;
  setupMessage: string;
}> {
  if (!supabase) return { homes: [], setupNeeded: false, setupMessage: "" };

  const { data, error } = await supabase
    .from("finance_homes")
    .select("*")
    .order("moved_in", { ascending: true });

  if (error) {
    if (isMissingHomes(error)) {
      return {
        homes: [],
        setupNeeded: true,
        setupMessage: `Homes need their table. Run ${HOMES_MIGRATION} in Supabase.`
      };
    }
    throw new Error(error.message);
  }

  return { homes: (data ?? []) as FinanceHome[], setupNeeded: false, setupMessage: "" };
}

export async function addFinanceHome(input: { userId: string; name: string; movedIn: string }) {
  if (!supabase) return;
  const { error } = await supabase
    .from("finance_homes")
    .insert({ user_id: input.userId, name: input.name, moved_in: input.movedIn });
  const failure = homesFailure(error);
  if (failure) throw failure;
}

export async function updateFinanceHome(input: { id: string; name: string; movedIn: string }) {
  if (!supabase) return;
  const { error } = await supabase
    .from("finance_homes")
    .update({ name: input.name, moved_in: input.movedIn, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  const failure = homesFailure(error);
  if (failure) throw failure;
}

export async function deleteFinanceHome(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from("finance_homes").delete().eq("id", id);
  const failure = homesFailure(error);
  if (failure) throw failure;
}

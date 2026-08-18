"use client";

import { authedFetch } from "@/lib/apiClient";
import { periodMonthOf } from "@/lib/expenses";
import { merchantMatchKey, rowBlockers } from "@/lib/statementImports";
import { supabase } from "@/lib/supabase";
import type { PaymentMethod } from "@/types/expense";
import type {
  MerchantRule,
  ParseStatementResponse,
  StatementImport,
  StatementImportRow
} from "@/types/statementImport";

function requireClient() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

/**
 * Posts the PDF to the scan route.
 *
 * Not `authedFetch` — that sets a JSON content type whenever a body is present,
 * which strips the multipart boundary the server needs to find the file.
 */
export async function scanStatement(file: File): Promise<ParseStatementResponse> {
  const client = requireClient();
  const {
    data: { session }
  } = await client.auth.getSession();
  if (!session?.access_token) throw new Error("Your session expired. Sign in again.");

  const body = new FormData();
  body.append("file", file);

  const response = await fetch("/api/statements/parse", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
    body
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string; importId?: string };
  if (!response.ok || !payload.importId) {
    throw new Error(payload.error || "The statement could not be scanned.");
  }

  return { importId: payload.importId };
}

export async function loadImports() {
  const { data, error } = await requireClient()
    .from("statement_imports")
    .select("*")
    .not("status", "eq", "Discarded")
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw error;
  return (data ?? []) as StatementImport[];
}

export async function loadImport(importId: string) {
  const { data, error } = await requireClient()
    .from("statement_imports")
    .select("*")
    .eq("id", importId)
    .maybeSingle();

  if (error) throw error;
  return (data as StatementImport | null) ?? null;
}

export async function loadRows(importId: string) {
  const { data, error } = await requireClient()
    .from("statement_import_rows")
    .select("*")
    .eq("import_id", importId)
    .order("row_index", { ascending: true });

  if (error) throw error;
  return (data ?? []) as StatementImportRow[];
}

export async function loadMerchantRules() {
  const { data, error } = await requireClient()
    .from("merchant_rules")
    .select("*");

  if (error) return [] as MerchantRule[];
  return (data ?? []) as MerchantRule[];
}

export async function saveRow(rowId: string, patch: Partial<StatementImportRow>) {
  const { error } = await requireClient()
    .from("statement_import_rows")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", rowId);

  if (error) throw error;
}

/** A transaction the statement never saw — cash, or a card the import missed. */
export async function addManualRow(
  importId: string,
  userId: string,
  nextIndex: number,
  date: string
) {
  const { data, error } = await requireClient()
    .from("statement_import_rows")
    .insert({
      import_id: importId,
      user_id: userId,
      row_index: nextIndex,
      date,
      description: "",
      merchant: "",
      amount: 0,
      direction: "Debit",
      category: null,
      decision: "Include",
      confidence: "high",
      source: "Manual"
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as StatementImportRow;
}

export async function deleteRow(rowId: string) {
  const { error } = await requireClient().from("statement_import_rows").delete().eq("id", rowId);
  if (error) throw error;
}

export async function discardImport(importId: string) {
  const { error } = await requireClient()
    .from("statement_imports")
    .update({ status: "Discarded", updated_at: new Date().toISOString() })
    .eq("id", importId);

  if (error) throw error;
}

/**
 * Teaches the next import what this one decided.
 *
 * One rule per decided row, keyed on the descriptor fingerprint. Flagged rows are
 * deliberately skipped: "I am not sure about this" is not a decision worth
 * replaying onto next month's statement.
 *
 * The memory is shared: one household, one answer per merchant. `user_id` still
 * records who last decided, which is why the upsert keys on the fingerprint
 * alone — a second person confirming the same merchant updates the rule rather
 * than starting a rival one.
 */
async function rememberDecisions(rows: StatementImportRow[], userId: string) {
  const existing = await loadMerchantRules();
  const counts = new Map(existing.map((rule) => [rule.match_key, rule.times_applied]));
  const now = new Date().toISOString();

  const rules = new Map<string, Record<string, unknown>>();
  rows
    .filter((row) => row.decision !== "Flag" && row.source === "Statement" && row.description.trim())
    .forEach((row) => {
      const matchKey = merchantMatchKey(row.description);
      rules.set(matchKey, {
        user_id: userId,
        match_key: matchKey,
        sample_description: row.description,
        merchant: row.merchant,
        category: row.decision === "Include" ? row.category : null,
        decision: row.decision,
        notes: row.notes,
        times_applied: (counts.get(matchKey) ?? 0) + 1,
        last_used_at: now,
        updated_at: now
      });
    });

  if (rules.size === 0) return;

  await requireClient()
    .from("merchant_rules")
    .upsert(Array.from(rules.values()), { onConflict: "match_key" });
}

export type ConfirmResult = {
  imported: number;
  flagged: number;
  complete: boolean;
};

/**
 * Writes the Included rows into the books.
 *
 * Flagged rows stay behind on the import — the statement is only marked done once
 * every row has an answer, so an unresolved transaction can never quietly vanish.
 */
export async function confirmImport({
  importId,
  userId,
  rows,
  paymentMethod
}: {
  importId: string;
  userId: string;
  rows: StatementImportRow[];
  paymentMethod: PaymentMethod;
}): Promise<ConfirmResult> {
  const client = requireClient();
  const pending = rows.filter((row) => row.decision === "Include" && !row.expense_id);

  const blocked = pending.find((row) => rowBlockers(row).length > 0);
  if (blocked) throw new Error(`${blocked.merchant || "A transaction"}: ${rowBlockers(blocked)[0]}.`);

  let insertedRows: StatementImportRow[] = [];

  if (pending.length > 0) {
    const payload = pending.map((row) => ({
      date: row.date,
      merchant: row.merchant.trim(),
      description: row.description.trim() || null,
      amount: Number(Number(row.amount).toFixed(2)),
      category: row.category,
      payment_method: paymentMethod,
      notes: row.notes?.trim() || null,
      receipt_id: row.receipt_id,
      proof_waived: false,
      expense_type: "Standard",
      statement_import_id: importId,
      user_id: userId
    }));

    const { data: created, error } = await client.from("expenses").insert(payload).select("id");
    if (error) throw error;

    const ids = (created ?? []) as { id: string }[];
    if (ids.length !== pending.length) {
      throw new Error("Some transactions did not save. Reload the import and try again.");
    }

    // PostgREST returns inserted rows in the order they were sent.
    await Promise.all(
      pending.map((row, index) => saveRow(row.id, { expense_id: ids[index].id }))
    );

    insertedRows = pending.map((row, index) => ({ ...row, expense_id: ids[index].id }));
  }

  await rememberDecisions(rows, userId);

  const flagged = rows.filter((row) => row.decision === "Flag").length;
  const complete = flagged === 0;

  await client
    .from("statement_imports")
    .update({
      status: complete ? "Imported" : "Review",
      imported_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", importId);

  // Best effort, exactly like the slide-over: the transactions are already saved,
  // and the manual Sync button drains anything Drive did not take.
  await Promise.all(
    insertedRows
      .filter((row) => row.receipt_id)
      .map(async (row) => {
        try {
          await authedFetch("/api/receipts/refile", {
            method: "POST",
            body: JSON.stringify({ receiptId: row.receipt_id, date: row.date })
          });
          await authedFetch("/api/receipts/sync", {
            method: "POST",
            body: JSON.stringify({ receiptId: row.receipt_id })
          });
        } catch {
          // Recorded on the receipt row; surfaced as "Waiting to archive".
        }
      })
  );

  return { imported: pending.length, flagged, complete };
}

/** Month an imported row will file under, shown before anything is written. */
export function filingMonth(row: Pick<StatementImportRow, "date">) {
  return periodMonthOf(row.date);
}

import { NextResponse } from "next/server";
import { auditStatement, extractStatement, parserModel } from "@/lib/statementExtraction";
import { sanitizeFilename } from "@/lib/formatters";
import { authenticateRequest } from "@/lib/serverAuth";
import {
  DEFAULT_IMPORT_CATEGORY,
  inferPeriodMonth,
  isKnownCategory,
  merchantFromDescriptor,
  merchantMatchKey,
  reconcile,
  rulesByKey
} from "@/lib/statementImports";
import type {
  ExtractedTransaction,
  MerchantRule,
  RowDecision
} from "@/types/statementImport";

export const runtime = "nodejs";
// Two model passes over a multi-page PDF. Slow by design — see lib/statementExtraction.ts.
export const maxDuration = 300;

/**
 * Anthropic caps a request at 32 MB, and base64 inflates by a third. 18 MB of
 * raw PDF leaves comfortable headroom, and a bank statement is a fraction of that.
 */
const MAX_BYTES = 18 * 1024 * 1024;

function isoDateOrNull(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** Drops anything the model returned that we cannot turn into a usable row. */
function usableTransactions(transactions: ExtractedTransaction[]) {
  return (transactions ?? []).filter(
    (row) => isoDateOrNull(row?.date) && Number.isFinite(Number(row?.amount)) && Number(row.amount) > 0
  );
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { admin, userId } = auth.caller;

  let file: File | null = null;
  try {
    const form = await request.formData();
    const entry = form.get("file");
    if (entry instanceof File) file = entry;
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "Attach a statement PDF." }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf") {
    return NextResponse.json({ error: "Statements have to be PDFs." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That PDF is too large to scan. Split it and import it in parts." },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64Pdf = bytes.toString("base64");
  const model = parserModel();

  // Recorded up front so a scan that dies mid-flight still leaves a trace the
  // user can see and retry, rather than silently vanishing.
  const { data: created, error: createError } = await admin
    .from("statement_imports")
    .insert({
      user_id: userId,
      filename: file.name || "statement.pdf",
      byte_size: file.size,
      status: "Parsing",
      model
    })
    .select("id")
    .single();

  if (createError || !created) {
    return NextResponse.json(
      { error: "Statement import tables are not ready. Run supabase/statement-import-schema.sql." },
      { status: 500 }
    );
  }

  const importId = created.id as string;

  async function fail(message: string) {
    await admin
      .from("statement_imports")
      .update({ status: "Failed", parse_error: message, updated_at: new Date().toISOString() })
      .eq("id", importId);
    return NextResponse.json({ error: message, importId }, { status: 502 });
  }

  try {
    const firstPass = await extractStatement(base64Pdf);
    const audited = await auditStatement(base64Pdf, firstPass);

    // The audit re-reads the document rather than trusting the first pass, so its
    // list is the one we keep. Both are stored for tracing a disputed row.
    const statement = audited.statement ?? firstPass.statement;
    const transactions = usableTransactions(audited.transactions ?? firstPass.transactions);

    const reconciliation = reconcile({
      statedTotalDebits: Number(statement?.statedTotalDebits ?? -1),
      statedTotalCredits: Number(statement?.statedTotalCredits ?? -1),
      transactions: transactions.map((row) => ({
        amount: Number(row.amount),
        direction: row.direction === "Credit" ? "Credit" : "Debit"
      })),
      auditAdjusted: audited.audit?.agrees === false,
      notes: [statement?.notes, audited.audit?.notes].filter(Boolean).join(" ")
    });

    // Everything the user has already taught us, applied before they see the list.
    const { data: ruleRows } = await admin
      .from("merchant_rules")
      .select("*")
      .eq("user_id", userId);
    const rules = rulesByKey((ruleRows ?? []) as MerchantRule[]);

    const periodStart = isoDateOrNull(statement?.periodStart);
    const periodEnd = isoDateOrNull(statement?.periodEnd);

    const rows = transactions.map((row, index) => {
      const description = (row.description || row.merchant || "").trim();
      const rule = rules.get(merchantMatchKey(description));
      const isCredit = row.direction === "Credit";

      // Credits are money coming in — never a deductible expense — so they start
      // excluded. They stay visible so a refund against a logged expense is easy
      // to spot, and the user can still pull one in.
      const decision: RowDecision = isCredit
        ? "Exclude"
        : rule?.decision === "Exclude"
          ? "Exclude"
          : "Include";

      return {
        import_id: importId,
        user_id: userId,
        row_index: index,
        date: row.date,
        description,
        merchant: (row.merchant || merchantFromDescriptor(description)).trim(),
        amount: Number(Number(row.amount).toFixed(2)),
        direction: isCredit ? "Credit" : "Debit",
        category: isKnownCategory(rule?.category)
          ? rule!.category
          : isCredit
            ? null
            : DEFAULT_IMPORT_CATEGORY,
        notes: rule?.notes ?? null,
        decision,
        confidence: row.confidence === "low" ? "low" : "high",
        auto_applied: Boolean(rule),
        source: "Statement"
      };
    });

    if (rows.length > 0) {
      const { error: rowsError } = await admin.from("statement_import_rows").insert(rows);
      if (rowsError) return fail("The scan read the statement but the rows could not be saved.");
    }

    // The statement itself is worth keeping next to the books, but it is not a
    // receipt — it stays in Supabase Storage and never enters the Drive archive.
    let storagePath: string | null = null;
    const periodMonth = inferPeriodMonth(
      periodEnd,
      rows.map((row) => row.date)
    );
    const year = (periodMonth ?? new Date().toISOString()).slice(0, 4);
    const candidatePath = `${userId}/statements/${year}/${Date.now()}-${sanitizeFilename(
      file.name || "statement.pdf"
    )}`;

    const { error: uploadError } = await admin.storage
      .from("receipts")
      .upload(candidatePath, bytes, { contentType: "application/pdf", upsert: false });
    if (!uploadError) storagePath = candidatePath;

    const { error: finalizeError } = await admin
      .from("statement_imports")
      .update({
        status: "Review",
        storage_path: storagePath,
        institution: statement?.institution || null,
        account_label: statement?.accountLabel || null,
        period_start: periodStart,
        period_end: periodEnd,
        period_month: periodMonth,
        reconciliation,
        raw_passes: [
          { pass: "extract", result: firstPass },
          { pass: "audit", result: audited }
        ],
        parse_error: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", importId);

    if (finalizeError) return fail("The scan finished but the import could not be saved.");

    return NextResponse.json({ importId });
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "The statement could not be scanned."
    );
  }
}

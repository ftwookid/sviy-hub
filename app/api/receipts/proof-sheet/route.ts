import { NextResponse } from "next/server";
import { proofState } from "@/lib/expenses";
import { mapSheetColumns, transcribeProofPdf } from "@/lib/proofSheetExtraction";
import {
  candidateDateRange,
  linesFromGrid,
  matchProofLines
} from "@/lib/proofSheets";
import { authenticateRequest } from "@/lib/serverAuth";
import { gridPreview, readGrid } from "@/lib/spreadsheet";
import type { ProofSheetExpense, ProofSheetLine, ProofSheetScan } from "@/types/proofSheet";

export const runtime = "nodejs";
// The spreadsheet path is quick; a long PDF report is not. See lib/proofSheetExtraction.ts.
export const maxDuration = 300;

/** Anthropic caps a request at 32 MB and base64 inflates by a third. */
const MAX_BYTES = 18 * 1024 * 1024;

/**
 * Reads a vendor report and says which transactions it proves.
 *
 * Nothing is written here. The route hands back a list of proposed matches for
 * the user to look over, and only the confirm step attaches the file — proof
 * landing on a transaction it does not cover is the failure worth designing
 * against, and it is invisible once it has happened.
 *
 * Matching is scoped to the caller's own transactions even for an admin. A
 * receipt belongs to whoever uploaded it, and quietly stapling one person's
 * parking report across another person's books is not a thing this should do.
 */
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

  if (!file) return NextResponse.json({ error: "Attach a report." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That file is too large to scan. Split it and upload it in parts." },
      { status: 400 }
    );
  }

  const filename = file.name || "report.xlsx";
  const isPdf = /\.pdf$/i.test(filename) || file.type === "application/pdf";
  if (!isPdf && !/\.(xlsx|csv|tsv)$/i.test(filename)) {
    return NextResponse.json(
      { error: "Upload the report as .xlsx, .csv, or .pdf." },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  let vendor = "";
  let notes = "";
  let lines: ProofSheetLine[] = [];

  try {
    if (isPdf) {
      const scanned = await transcribeProofPdf(bytes.toString("base64"));
      vendor = scanned.vendor || "";
      notes = scanned.notes || "";
      lines = (scanned.lines ?? [])
        .filter((line) => /^\d{4}-\d{2}-\d{2}$/.test(line?.date) && Number(line?.amount) > 0)
        .map((line, index) => ({
          row: index + 1,
          date: line.date,
          amount: Number(Number(line.amount).toFixed(2)),
          description: (line.description || "").trim()
        }));
    } else {
      const grid = readGrid(bytes, filename);
      if (grid.rowCount === 0) {
        return NextResponse.json({ error: "That file had no rows in it." }, { status: 400 });
      }
      const map = await mapSheetColumns(gridPreview(grid));
      vendor = map.vendor || "";
      notes = map.notes || "";
      lines = linesFromGrid(grid, map);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That report could not be scanned." },
      { status: 502 }
    );
  }

  if (lines.length === 0) {
    return NextResponse.json(
      { error: "No charges could be read out of that file. Check it is the right report." },
      { status: 422 }
    );
  }

  const range = candidateDateRange(lines);
  if (!range) {
    return NextResponse.json({ error: "That report had no usable dates." }, { status: 422 });
  }

  // Only transactions still without proof are candidates: a row that already
  // has a receipt has better proof than a summary, and replacing it silently
  // would retire a file someone chose.
  const { data: expenseRows, error: expenseError } = await admin
    .from("expenses")
    .select("id, date, merchant, amount, category, receipt_id, proof_waived")
    .is("receipt_id", null)
    .gte("date", range.start)
    .lte("date", range.end)
    .order("date", { ascending: true });

  if (expenseError) {
    return NextResponse.json({ error: "Could not read the transactions." }, { status: 500 });
  }

  const candidates: ProofSheetExpense[] = (expenseRows ?? []).map((row) => ({
    id: row.id as string,
    date: row.date as string,
    merchant: (row.merchant as string) ?? "",
    amount: Number(row.amount),
    category: (row.category as string) ?? "",
    proof: proofState({
      receipt_id: row.receipt_id as string | null,
      proof_waived: Boolean(row.proof_waived)
    })
  }));

  const matches = matchProofLines(lines, candidates);

  const scan: ProofSheetScan = {
    vendor,
    lineCount: lines.length,
    matches,
    unmatchedCount: lines.length - matches.length,
    periodStart: lines.reduce((min, line) => (line.date < min ? line.date : min), lines[0].date),
    periodEnd: lines.reduce((max, line) => (line.date > max ? line.date : max), lines[0].date),
    notes
  };

  return NextResponse.json(scan);
}

"use client";

import { authedFetch } from "@/lib/apiClient";
import { uploadReceipt } from "@/lib/receiptUpload";
import { supabase } from "@/lib/supabase";
import type { Receipt } from "@/types/expense";
import type { ProofSheetScan } from "@/types/proofSheet";

/**
 * Scanning a vendor report, then attaching it to everything it proves.
 *
 * The file is uploaded only once the user has confirmed the matches. Scanning
 * writes nothing, so backing out of the review leaves no half-attached receipt
 * and no orphaned file in Drive.
 */

/**
 * Not `authedFetch` — that sets a JSON content type whenever a body is present,
 * which strips the multipart boundary the server needs to find the file.
 */
export async function scanProofSheet(file: File): Promise<ProofSheetScan> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your session expired. Sign in again.");

  const body = new FormData();
  body.append("file", file);

  const response = await fetch("/api/receipts/proof-sheet", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
    body
  });

  const payload = (await response.json().catch(() => ({}))) as ProofSheetScan & { error?: string };
  if (!response.ok) throw new Error(payload.error || "That report could not be scanned.");

  return payload;
}

/**
 * Files the report as one receipt and points every chosen transaction at it.
 *
 * The three steps are the ones every other attach path performs — upload, point
 * the transactions at it, archive to Drive — except that the middle one covers
 * many rows instead of one. Only the first two decide whether this succeeded;
 * the archive is best effort everywhere in the app, and its failures surface as
 * "Waiting to archive" rather than a failed attach.
 */
export async function attachProofSheet(
  file: File,
  userId: string,
  expenseIds: string[],
  periodDate: string
): Promise<Receipt> {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (expenseIds.length === 0) throw new Error("Nothing was selected to attach this to.");

  const { receipt } = await uploadReceipt(file, userId, periodDate);

  // Attaching proof clears a waiver: the row now has the real thing, and leaving
  // the note behind would keep claiming there is a reason it does not.
  const { error } = await supabase
    .from("expenses")
    .update({
      receipt_id: receipt.id,
      proof_waived: false,
      proof_note: null,
      updated_at: new Date().toISOString()
    })
    .in("id", expenseIds);

  if (error) throw new Error(error.message || "Those transactions could not be updated.");

  try {
    await authedFetch("/api/receipts/refile", {
      method: "POST",
      body: JSON.stringify({ receiptId: receipt.id, date: periodDate })
    });
    await authedFetch("/api/receipts/sync", {
      method: "POST",
      body: JSON.stringify({ receiptId: receipt.id })
    });
  } catch {
    // Recorded on the receipt row; the manual Sync button is the retry path.
  }

  return receipt;
}

"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Upload } from "lucide-react";
import { authedFetch } from "@/lib/apiClient";
import { cn } from "@/lib/cn";
import { uploadReceipt } from "@/lib/receiptUpload";
import { supabase } from "@/lib/supabase";
import type { Expense, Receipt } from "@/types/expense";

/**
 * Attach a receipt to a transaction without opening it.
 *
 * Chasing missing proof is the one job on this page that is done in a run —
 * you sit down with a pile of receipts and work through the rows that have
 * none. Routing each one through the full edit slide-over meant four taps and
 * a Save button to change a single field, so the row offers the file picker
 * directly. The slide-over stays the place to swap or remove one.
 *
 * The three steps are the same ones the slide-over performs: upload the file,
 * point the expense at it, then archive to Drive. Only the first two decide
 * whether this succeeded — the archive is best effort everywhere in the app,
 * and its failures surface as "Waiting to archive" rather than a failed attach.
 */
export function QuickReceiptButton({
  expense,
  userId,
  onAttached,
  onError
}: {
  expense: Expense;
  userId: string;
  onAttached: (receipt: Receipt) => void;
  onError: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    if (!supabase) {
      onError("Supabase is not configured.");
      return;
    }

    setUploading(true);
    try {
      const { receipt } = await uploadReceipt(file, userId, expense.date);

      // Attaching proof clears a waiver: the row now has the real thing, and
      // leaving the note behind would keep claiming there is a reason it does not.
      const { error } = await supabase
        .from("expenses")
        .update({
          receipt_id: receipt.id,
          proof_waived: false,
          proof_note: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", expense.id);

      if (error) throw error;
      onAttached(receipt);

      try {
        await authedFetch("/api/receipts/refile", {
          method: "POST",
          body: JSON.stringify({ receiptId: receipt.id, date: expense.date })
        });
        await authedFetch("/api/receipts/sync", {
          method: "POST",
          body: JSON.stringify({ receiptId: receipt.id })
        });
      } catch {
        // Recorded on the receipt row; the manual Sync button is the retry path.
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not upload that file.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <label
      className={cn(
        // Not `.focus-ring`: the focusable element here is the hidden input, and
        // the label it sits in never receives focus. See globals.css.
        "focus-ring-within grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-border-emphasis bg-surface text-text-secondary transition",
        "hover:border-accent hover:text-text-primary",
        uploading && "pointer-events-none opacity-60"
      )}
      title="Add receipt"
    >
      {uploading ? (
        <LoaderCircle size={15} strokeWidth={2} className="animate-spin" />
      ) : (
        <Upload size={15} strokeWidth={1.9} />
      )}
      <span className="sr-only">Add a receipt for {expense.merchant}</span>
      {/* No `capture`: on a phone that would jump straight to the camera and
          take away the photo library, which is where receipts usually already are. */}
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/*,.pdf,application/pdf"
        disabled={uploading}
        onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}

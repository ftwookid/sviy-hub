"use client";

import { authedFetch } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";

/**
 * Deleting transactions, one or a hundred at a time.
 *
 * Two things have to happen and only one of them is allowed to fail loudly:
 * the rows go, and any receipt they were holding is retired from Drive. If the
 * archive call fails the expense is already gone, so a stranded Drive file is
 * the lesser problem — it stays recoverable from the folder itself.
 */
export async function deleteExpenses(ids: string[], receiptIds: string[] = []) {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (ids.length === 0) return;

  const { error } = await supabase.from("expenses").delete().in("id", ids);
  if (error) throw new Error(error.message || "Could not delete these transactions.");

  await Promise.all(
    Array.from(new Set(receiptIds.filter(Boolean))).map(async (receiptId) => {
      try {
        await authedFetch("/api/receipts/discard", {
          method: "POST",
          body: JSON.stringify({ receiptId })
        });
      } catch {
        // See above: the books are already correct.
      }
    })
  );
}

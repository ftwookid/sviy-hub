"use client";

import { periodMonthOf } from "@/lib/expenses";
import { sanitizeFilename } from "@/lib/formatters";
import { prepareReceiptFile } from "@/lib/receiptImage";
import { supabase } from "@/lib/supabase";
import type { Receipt } from "@/types/expense";

export type UploadedReceipt = {
  receipt: Receipt;
  originalBytes: number;
  storedBytes: number;
};

/**
 * Compresses, uploads to the private `receipts` bucket, and records the receipt.
 *
 * The storage path stays `{user_id}/{year}/{month}/{file}` so the existing
 * owner-scoped storage policies keyed on the first path segment still apply.
 */
export async function uploadReceipt(
  file: File,
  userId: string,
  expenseDate: string
): Promise<UploadedReceipt> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const prepared = await prepareReceiptFile(file);
  const periodMonth = periodMonthOf(expenseDate);
  const [year, month] = periodMonth.split("-");
  const storagePath = `${userId}/${year}/${month}/${Date.now()}-${sanitizeFilename(prepared.file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from("receipts")
    .upload(storagePath, prepared.file, { upsert: false });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("receipts")
    .insert({
      user_id: userId,
      filename: prepared.file.name,
      mime_type: prepared.file.type || "application/octet-stream",
      byte_size: prepared.file.size,
      storage_path: storagePath,
      period_month: periodMonth
    })
    .select("*")
    .single();

  if (error) {
    // Don't leave an orphaned object behind if the row insert fails.
    await supabase.storage.from("receipts").remove([storagePath]);
    throw error;
  }

  return {
    receipt: data as Receipt,
    originalBytes: prepared.originalBytes,
    storedBytes: prepared.compressedBytes
  };
}

/** Signed URL for viewing a stored receipt, or the Drive link once archived. */
export async function receiptViewUrl(receipt: Receipt): Promise<string | null> {
  if (receipt.drive_link) return receipt.drive_link;
  if (!receipt.storage_path || !supabase) return null;

  const { data } = await supabase.storage
    .from("receipts")
    .createSignedUrl(receipt.storage_path, 60 * 10);

  return data?.signedUrl ?? null;
}

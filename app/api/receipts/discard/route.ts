import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";
import { trashFile } from "@/lib/googleDrive";
import { resolveArchiveTarget } from "@/lib/receiptArchive";

/**
 * Retires a receipt whose transaction is gone, or that was swapped for another.
 *
 * The Drive copy is trashed rather than deleted, so it stays recoverable for 30
 * days — removing a transaction should tidy the archive, never destroy proof.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { admin, userId } = auth.caller;
  const body = (await request.json().catch(() => ({}))) as { receiptId?: string };

  if (!body.receiptId) {
    return NextResponse.json({ error: "A receipt is required." }, { status: 400 });
  }

  const { data: receipt, error: readError } = await admin
    .from("receipts")
    .select("id, storage_path, drive_file_id")
    .eq("id", body.receiptId)
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: "Could not read that receipt." }, { status: 500 });
  if (!receipt) return NextResponse.json({ trashed: false, reason: "not-found" });

  let trashed = false;
  if (receipt.drive_file_id) {
    const setup = await resolveArchiveTarget(admin, userId);
    if (setup.ok) {
      try {
        await trashFile(setup.target.accessToken, receipt.drive_file_id);
        trashed = true;
      } catch (error) {
        // Losing the Drive copy to a stale id must not strand the app row, so
        // the failure is reported and the local cleanup still runs.
        const message = error instanceof Error ? error.message : "Could not trash the Drive file.";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }
  }

  if (receipt.storage_path) {
    await admin.storage.from("receipts").remove([receipt.storage_path]);
  }
  await admin.from("receipts").delete().eq("id", receipt.id);

  return NextResponse.json({ trashed });
}

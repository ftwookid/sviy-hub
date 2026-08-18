import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";
import { ensureMonthFolder, moveFileToFolder } from "@/lib/googleDrive";
import { periodMonthOf } from "@/lib/expenses";
import { resolveArchiveTarget } from "@/lib/receiptArchive";

/**
 * Re-files a receipt after its transaction moved to a different month.
 *
 * Without this the archive drifts from the books: a June receipt corrected to
 * July would sit in the June folder forever, and the folder a receipt lives in
 * is exactly what makes it usable as proof for a given month.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { admin } = auth.caller;
  const body = (await request.json().catch(() => ({}))) as {
    receiptId?: string;
    date?: string;
  };

  if (!body.receiptId || !body.date) {
    return NextResponse.json({ error: "A receipt and a date are required." }, { status: 400 });
  }

  const periodMonth = periodMonthOf(body.date);

  const { data: receipt, error: readError } = await admin
    .from("receipts")
    .select("id, user_id, period_month, drive_file_id")
    .eq("id", body.receiptId)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: "Could not read that receipt." }, { status: 500 });
  if (!receipt) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });

  if (receipt.period_month === periodMonth) {
    return NextResponse.json({ moved: false, periodMonth });
  }

  // The stamped month is corrected even when Drive is unreachable, so a later
  // sync files the receipt under the right month rather than the stale one.
  await admin
    .from("receipts")
    .update({ period_month: periodMonth, updated_at: new Date().toISOString() })
    .eq("id", receipt.id);

  if (!receipt.drive_file_id) {
    return NextResponse.json({ moved: false, periodMonth, reason: "not-archived" });
  }

  // Moved inside the Drive of whoever uploaded it — see the note in discard.
  const setup = await resolveArchiveTarget(admin, receipt.user_id);
  if (!setup.ok) return NextResponse.json({ moved: false, periodMonth, reason: setup.reason });

  try {
    const folderId = await ensureMonthFolder(
      setup.target.accessToken,
      setup.target.rootFolderId,
      periodMonth
    );
    await moveFileToFolder(setup.target.accessToken, receipt.drive_file_id, folderId);
    await admin
      .from("receipts")
      .update({ drive_error: null, drive_synced_at: new Date().toISOString() })
      .eq("id", receipt.id);

    return NextResponse.json({ moved: true, periodMonth });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not move the receipt in Drive.";
    await admin.from("receipts").update({ drive_error: message }).eq("id", receipt.id);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

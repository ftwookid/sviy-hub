import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";
import { ensureMonthFolder, getAccessToken, uploadFileToDrive } from "@/lib/googleDrive";

/**
 * Archives receipts that are in Supabase Storage but not yet in Drive.
 *
 * Batched so a serverless invocation cannot time out on a large backlog: the
 * response reports whether more remain, and the client calls again until done.
 */
const BATCH_SIZE = 8;

type PendingReceipt = {
  id: string;
  filename: string;
  mime_type: string;
  storage_path: string | null;
  period_month: string;
};

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { admin, userId } = auth.caller;

  let accessToken: string;
  let rootFolderId: string | null;
  try {
    const resolved = await getAccessToken(admin, userId);
    accessToken = resolved.accessToken;
    rootFolderId = resolved.account.root_folder_id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive is not connected.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!rootFolderId) {
    return NextResponse.json(
      { error: "Choose the Drive folder to archive into before syncing." },
      { status: 400 }
    );
  }

  const { data: pending, error: pendingError } = await admin
    .from("receipts")
    .select("id, filename, mime_type, storage_path, period_month")
    .eq("user_id", userId)
    .is("drive_file_id", null)
    .not("storage_path", "is", null)
    .order("period_month", { ascending: true })
    .limit(BATCH_SIZE + 1);

  if (pendingError) {
    return NextResponse.json({ error: "Could not read pending receipts." }, { status: 500 });
  }

  const queue = ((pending ?? []) as PendingReceipt[]).slice(0, BATCH_SIZE);
  const hasMore = (pending?.length ?? 0) > BATCH_SIZE;

  // Folder ids are reused across receipts in the same month.
  const monthFolders = new Map<string, string>();
  let synced = 0;
  const failures: { id: string; message: string }[] = [];

  for (const receipt of queue) {
    try {
      if (!receipt.storage_path) throw new Error("Receipt has no stored file.");

      const download = await admin.storage.from("receipts").download(receipt.storage_path);
      if (download.error || !download.data) {
        throw new Error(download.error?.message || "Could not read the stored file.");
      }

      let folderId = monthFolders.get(receipt.period_month);
      if (!folderId) {
        folderId = await ensureMonthFolder(accessToken, rootFolderId, receipt.period_month);
        monthFolders.set(receipt.period_month, folderId);
      }

      const uploaded = await uploadFileToDrive(accessToken, {
        name: receipt.filename,
        mimeType: receipt.mime_type || "application/octet-stream",
        parentId: folderId,
        bytes: await download.data.arrayBuffer()
      });

      await admin
        .from("receipts")
        .update({
          drive_file_id: uploaded.id,
          drive_link: uploaded.webViewLink ?? `https://drive.google.com/file/d/${uploaded.id}/view`,
          drive_synced_at: new Date().toISOString(),
          drive_error: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", receipt.id);

      synced += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      failures.push({ id: receipt.id, message });
      await admin
        .from("receipts")
        .update({ drive_error: message, updated_at: new Date().toISOString() })
        .eq("id", receipt.id);
    }
  }

  await admin
    .from("google_drive_accounts")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_error: failures.length ? failures[0].message : null,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId);

  return NextResponse.json({
    synced,
    failed: failures.length,
    hasMore,
    errors: failures.map((failure) => failure.message)
  });
}

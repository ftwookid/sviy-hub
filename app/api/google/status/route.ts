import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";
import { googleOAuthConfigured, loadDriveAccount } from "@/lib/googleDrive";
import { archiveAccountUserId } from "@/lib/receiptArchive";
import type { DriveConnection } from "@/types/expense";

const DISCONNECTED: DriveConnection = {
  connected: false,
  googleEmail: null,
  rootFolderId: null,
  rootFolderName: null,
  lastSyncAt: null,
  lastSyncError: null
};

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!googleOAuthConfigured()) {
    return NextResponse.json({ configured: false, connection: DISCONNECTED });
  }

  // Everyone reads the state of the one shared archive; only an admin can
  // change it. Seeing "archiving to Ivan's Drive" is the point — it tells the
  // other person their receipts are going somewhere real.
  const ownerId = await archiveAccountUserId(auth.caller.admin);
  const account = ownerId ? await loadDriveAccount(auth.caller.admin, ownerId) : null;
  if (!account) {
    return NextResponse.json({ configured: true, connection: DISCONNECTED });
  }

  const connection: DriveConnection = {
    connected: true,
    googleEmail: account.google_email,
    rootFolderId: account.root_folder_id,
    rootFolderName: account.root_folder_name,
    lastSyncAt: account.last_sync_at,
    lastSyncError: account.last_sync_error
  };

  return NextResponse.json({ configured: true, connection });
}

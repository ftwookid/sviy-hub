import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";
import { googleOAuthConfigured, loadDriveAccount } from "@/lib/googleDrive";
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

  const account = await loadDriveAccount(auth.caller.admin, auth.caller.userId);
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

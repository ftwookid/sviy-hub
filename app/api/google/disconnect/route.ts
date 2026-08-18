import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/serverAuth";
import { loadDriveAccount } from "@/lib/googleDrive";
import { archiveAccountUserId } from "@/lib/receiptArchive";

/**
 * Forgets the stored Google tokens and revokes them at Google.
 *
 * Receipts already archived in Drive are left alone — the files stay in the
 * admin's Drive folder, only Sviy Hub's access to them is dropped.
 */
export async function POST(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const ownerId = (await archiveAccountUserId(auth.caller.admin)) ?? auth.caller.userId;
  const account = await loadDriveAccount(auth.caller.admin, ownerId);

  if (account?.refresh_token) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: account.refresh_token })
      });
    } catch {
      // Revocation is best effort — dropping our copy is what actually matters.
    }
  }

  const { error } = await auth.caller.admin
    .from("google_drive_accounts")
    .delete()
    .eq("user_id", ownerId);

  if (error) {
    return NextResponse.json({ error: "Could not disconnect Google Drive." }, { status: 500 });
  }

  return NextResponse.json({ disconnected: true });
}

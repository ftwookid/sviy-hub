import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";
import { loadDriveAccount } from "@/lib/googleDrive";

/**
 * Forgets the stored Google tokens and revokes them at Google.
 *
 * Receipts already archived in Drive are left alone — the files stay in the
 * user's own Drive folder, only Sviy Hub's access to them is dropped.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const account = await loadDriveAccount(auth.caller.admin, auth.caller.userId);

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
    .eq("user_id", auth.caller.userId);

  if (error) {
    return NextResponse.json({ error: "Could not disconnect Google Drive." }, { status: 500 });
  }

  return NextResponse.json({ disconnected: true });
}

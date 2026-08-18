import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccessToken } from "@/lib/googleDrive";

/**
 * Shared setup for the routes that keep Drive in step with the app.
 *
 * Every one of them needs the same three things — a live access token, the
 * chosen root folder, and a clear reason when either is missing — so the
 * "not connected" and "no folder yet" cases read identically everywhere.
 */
export type ArchiveTarget = { accessToken: string; rootFolderId: string };

export type ArchiveSetup =
  | { ok: true; target: ArchiveTarget }
  | { ok: false; reason: "disconnected" | "no-folder"; message: string };

/**
 * The single Google account the whole app archives into — the admin's.
 *
 * One family business keeps one archive. Per-person Drives would scatter a
 * year's proof across two accounts and leave neither of them complete, which is
 * exactly the wrong shape for the one moment it matters.
 */
export async function archiveAccountUserId(admin: SupabaseClient): Promise<string | null> {
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
  const adminIds = ((admins ?? []) as { id: string }[]).map((row) => row.id);
  if (adminIds.length === 0) return null;

  // Prefer an admin who has actually connected, so a second admin who never did
  // cannot shadow a working connection.
  const { data: connected } = await admin
    .from("google_drive_accounts")
    .select("user_id")
    .in("user_id", adminIds)
    .limit(1);

  return ((connected ?? []) as { user_id: string }[])[0]?.user_id ?? adminIds[0];
}

export async function resolveArchiveTarget(admin: SupabaseClient): Promise<ArchiveSetup> {
  const userId = await archiveAccountUserId(admin);
  if (!userId) {
    return {
      ok: false,
      reason: "disconnected",
      message: "No admin account is set up to archive into."
    };
  }

  let accessToken: string;
  let rootFolderId: string | null;

  try {
    const resolved = await getAccessToken(admin, userId);
    accessToken = resolved.accessToken;
    rootFolderId = resolved.account.root_folder_id;
  } catch (error) {
    return {
      ok: false,
      reason: "disconnected",
      message: error instanceof Error ? error.message : "Google Drive is not connected."
    };
  }

  if (!rootFolderId) {
    return {
      ok: false,
      reason: "no-folder",
      message: "Choose the Drive folder to archive into before syncing."
    };
  }

  return { ok: true, target: { accessToken, rootFolderId } };
}

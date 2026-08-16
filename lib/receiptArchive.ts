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

export async function resolveArchiveTarget(
  admin: SupabaseClient,
  userId: string
): Promise<ArchiveSetup> {
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

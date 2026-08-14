import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";
import { describeFolder, getAccessToken } from "@/lib/googleDrive";

/**
 * Stores the Drive folder the user selected in the Google Picker.
 *
 * Picking is what grants drive.file access to a folder the app did not create,
 * so this is verified server-side before it is saved.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let folderId = "";
  try {
    const body = (await request.json()) as { folderId?: string };
    folderId = (body.folderId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!folderId) {
    return NextResponse.json({ error: "Choose a folder first." }, { status: 400 });
  }

  try {
    const { accessToken } = await getAccessToken(auth.caller.admin, auth.caller.userId);
    const folder = await describeFolder(accessToken, folderId);

    const { error } = await auth.caller.admin
      .from("google_drive_accounts")
      .update({
        root_folder_id: folder.id,
        root_folder_name: folder.name,
        last_sync_error: null,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", auth.caller.userId);

    if (error) throw error;

    return NextResponse.json({ folderId: folder.id, folderName: folder.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save that folder.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

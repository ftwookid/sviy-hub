import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/serverAuth";
import { archiveAccountUserId } from "@/lib/receiptArchive";
import { getAccessToken } from "@/lib/googleDrive";

/**
 * Short-lived credentials for the Google Picker.
 *
 * The Picker runs in the browser and needs a live OAuth access token. It is
 * minted here rather than stored client-side, and it expires within the hour.
 * The refresh token never leaves the server.
 */
/**
 * The Picker's app id is the Cloud project number, which is the leading segment
 * of the OAuth client id. With the drive.file scope the Picker only grants the
 * app access to the picked folder when this matches the project that owns the
 * OAuth client, so it is derived rather than configured separately.
 */
function pickerAppId() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
  const projectNumber = clientId.split("-")[0];
  return /^\d+$/.test(projectNumber) ? projectNumber : null;
}

export async function GET(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const ownerId = (await archiveAccountUserId(auth.caller.admin)) ?? auth.caller.userId;
    const { accessToken } = await getAccessToken(auth.caller.admin, ownerId);

    return NextResponse.json({
      accessToken,
      // Must be a key with the Picker API enabled. The Maps key is not one: it
      // is restricted to Maps/Places, and the Picker rejects it outright with
      // "The API developer key is invalid." No fallback for that reason.
      developerKey: process.env.GOOGLE_PICKER_API_KEY ?? null,
      appId: pickerAppId(),
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reach Google Drive.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

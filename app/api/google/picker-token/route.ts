import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";
import { getAccessToken } from "@/lib/googleDrive";

/**
 * Short-lived credentials for the Google Picker.
 *
 * The Picker runs in the browser and needs a live OAuth access token. It is
 * minted here rather than stored client-side, and it expires within the hour.
 * The refresh token never leaves the server.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { accessToken } = await getAccessToken(auth.caller.admin, auth.caller.userId);

    return NextResponse.json({
      accessToken,
      developerKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null,
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reach Google Drive.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

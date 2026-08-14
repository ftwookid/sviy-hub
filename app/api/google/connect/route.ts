import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";
import { buildConsentUrl, googleOAuthConfigured } from "@/lib/googleDrive";

/** Returns the Google consent URL for the signed-in user to visit. */
export async function POST(request: Request) {
  if (!googleOAuthConfigured()) {
    return NextResponse.json(
      { error: "Google Drive is not configured. Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET." },
      { status: 500 }
    );
  }

  const auth = await authenticateRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json({ url: buildConsentUrl(request, auth.caller.userId) });
}

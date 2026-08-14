import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/serverAuth";
import { exchangeCodeForTokens, verifyOAuthState } from "@/lib/googleDrive";

function backTo(request: Request, params: Record<string, string>) {
  const url = new URL("/", new URL(request.url).origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return NextResponse.redirect(url);
}

/**
 * Google redirects the browser here after consent. There is no Supabase session
 * on this request, so the user is identified by the signed `state` parameter.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return backTo(request, { drive: "error", message: "Google access was declined." });
  }
  if (!code || !state) {
    return backTo(request, { drive: "error", message: "Google returned an incomplete response." });
  }

  const userId = verifyOAuthState(state);
  if (!userId) {
    return backTo(request, { drive: "error", message: "That Google link expired. Try connecting again." });
  }

  const admin = createServiceClient();
  if (!admin) {
    return backTo(request, { drive: "error", message: "Server Supabase access is not configured." });
  }

  try {
    const tokens = await exchangeCodeForTokens(request, code);

    // Google only returns a refresh token on first consent. On reconnect, keep
    // the stored one rather than wiping it.
    const { data: existing } = await admin
      .from("google_drive_accounts")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();

    const refreshToken = tokens.refreshToken ?? existing?.refresh_token;
    if (!refreshToken) {
      return backTo(request, {
        drive: "error",
        message: "Google did not return a refresh token. Remove Sviy Hub at myaccount.google.com/permissions and connect again."
      });
    }

    const { error } = await admin.from("google_drive_accounts").upsert(
      {
        user_id: userId,
        refresh_token: refreshToken,
        access_token: tokens.accessToken,
        access_token_expires_at: new Date(Date.now() + tokens.expiresInSeconds * 1000).toISOString(),
        google_email: tokens.email,
        last_sync_error: null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );

    if (error) throw error;

    return backTo(request, { drive: "connected" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not connect Google Drive.";
    return backTo(request, { drive: "error", message });
  }
}

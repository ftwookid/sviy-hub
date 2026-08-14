import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { driveMonthFolderName, driveYearFolderName } from "@/lib/expenses";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * drive.file is deliberately the only Drive scope requested. It grants access
 * to files and folders this app creates, plus anything the user explicitly
 * hands over through the Google Picker — and unlike full Drive scope it is not
 * "restricted", so it needs no Google security review.
 */
export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "email"
].join(" ");

export const INVOICES_FOLDER_NAME = "Invoices";

export function googleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function redirectUri(request: Request) {
  const configured = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (configured) return configured;
  return `${new URL(request.url).origin}/api/google/callback`;
}

// ---------------------------------------------------------------------------
// OAuth state
//
// The callback arrives as a plain browser redirect with no Supabase session, so
// the user id travels in the `state` parameter. It is HMAC-signed with the
// service role key so a forged state cannot bind someone else's Drive account.
// ---------------------------------------------------------------------------

const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to sign OAuth state.");
  return secret;
}

export function signOAuthState(userId: string) {
  const payload = `${userId}.${Date.now()}`;
  const signature = crypto.createHmac("sha256", stateSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function verifyOAuthState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const [userId, issuedAt, signature] = decoded.split(".");
    if (!userId || !issuedAt || !signature) return null;

    const expected = crypto
      .createHmac("sha256", stateSecret())
      .update(`${userId}.${issuedAt}`)
      .digest("hex");

    const provided = Buffer.from(signature);
    const computed = Buffer.from(expected);
    if (provided.length !== computed.length) return null;
    if (!crypto.timingSafeEqual(provided, computed)) return null;

    if (Date.now() - Number(issuedAt) > STATE_TTL_MS) return null;
    return userId;
  } catch {
    return null;
  }
}

export function buildConsentUrl(request: Request, userId: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID as string,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: DRIVE_SCOPES,
    // Both are required to be handed a refresh token we can store.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: signOAuthState(userId)
  });

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
};

function decodeIdTokenEmail(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof claims.email === "string" ? claims.email : null;
  } catch {
    return null;
  }
}

export async function exchangeCodeForTokens(request: Request, code: string) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET as string,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code"
    })
  });

  const body = (await response.json()) as TokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || "Google rejected the authorization code.");
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresInSeconds: body.expires_in ?? 3600,
    email: decodeIdTokenEmail(body.id_token)
  };
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET as string,
      grant_type: "refresh_token"
    })
  });

  const body = (await response.json()) as TokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || "Could not refresh Google access.");
  }

  return { accessToken: body.access_token, expiresInSeconds: body.expires_in ?? 3600 };
}

export type DriveAccountRow = {
  user_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  google_email: string | null;
  root_folder_id: string | null;
  root_folder_name: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
};

export async function loadDriveAccount(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("google_drive_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  return (data as DriveAccountRow | null) ?? null;
}

/** Returns a valid access token, refreshing and persisting it when needed. */
export async function getAccessToken(admin: SupabaseClient, userId: string) {
  const account = await loadDriveAccount(admin, userId);
  if (!account) throw new Error("Google Drive is not connected.");

  const expiresAt = account.access_token_expires_at
    ? new Date(account.access_token_expires_at).getTime()
    : 0;
  // 60s of slack so a token can't expire mid-upload.
  if (account.access_token && expiresAt - 60_000 > Date.now()) {
    return { accessToken: account.access_token, account };
  }

  const refreshed = await refreshAccessToken(account.refresh_token);
  const nextExpiry = new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString();

  await admin
    .from("google_drive_accounts")
    .update({
      access_token: refreshed.accessToken,
      access_token_expires_at: nextExpiry,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId);

  return { accessToken: refreshed.accessToken, account };
}

// ---------------------------------------------------------------------------
// Drive operations
// ---------------------------------------------------------------------------

async function driveRequest(accessToken: string, url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Drive error ${response.status}: ${detail.slice(0, 300)}`);
  }

  return response;
}

function escapeQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Finds a subfolder by name, creating it when absent. */
export async function ensureFolder(accessToken: string, name: string, parentId: string) {
  const query = [
    `name = '${escapeQueryValue(name)}'`,
    `'${escapeQueryValue(parentId)}' in parents`,
    `mimeType = '${FOLDER_MIME}'`,
    "trashed = false"
  ].join(" and ");

  const searchUrl = `${DRIVE_FILES}?q=${encodeURIComponent(query)}&fields=${encodeURIComponent("files(id,name)")}&pageSize=1`;
  const searchResponse = await driveRequest(accessToken, searchUrl);
  const found = (await searchResponse.json()) as { files?: { id: string }[] };
  if (found.files?.length) return found.files[0].id;

  const createResponse = await driveRequest(accessToken, `${DRIVE_FILES}?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] })
  });

  const created = (await createResponse.json()) as { id: string };
  return created.id;
}

/**
 * Builds (or reuses) `<root>/<year>/Invoices/<MM Month>` and returns the month
 * folder id. Idempotent — safe to call for every upload.
 */
export async function ensureMonthFolder(accessToken: string, rootFolderId: string, periodMonth: string) {
  const yearFolderId = await ensureFolder(accessToken, driveYearFolderName(periodMonth), rootFolderId);
  const invoicesFolderId = await ensureFolder(accessToken, INVOICES_FOLDER_NAME, yearFolderId);
  return ensureFolder(accessToken, driveMonthFolderName(periodMonth), invoicesFolderId);
}

export async function uploadFileToDrive(
  accessToken: string,
  input: { name: string; mimeType: string; parentId: string; bytes: ArrayBuffer }
) {
  const boundary = `sviyhub${crypto.randomBytes(12).toString("hex")}`;
  const metadata = JSON.stringify({ name: input.name, parents: [input.parentId] });

  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, Buffer.from(input.bytes), tail]);

  const response = await driveRequest(
    accessToken,
    `${DRIVE_UPLOAD}?uploadType=multipart&fields=${encodeURIComponent("id,webViewLink")}`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length)
      },
      body: new Uint8Array(body)
    }
  );

  return (await response.json()) as { id: string; webViewLink?: string };
}

/** Confirms a picked folder is reachable and returns its name. */
export async function describeFolder(accessToken: string, folderId: string) {
  const response = await driveRequest(
    accessToken,
    `${DRIVE_FILES}/${encodeURIComponent(folderId)}?fields=${encodeURIComponent("id,name,mimeType")}`
  );

  const folder = (await response.json()) as { id: string; name: string; mimeType: string };
  if (folder.mimeType !== FOLDER_MIME) throw new Error("That Drive item is not a folder.");
  return folder;
}

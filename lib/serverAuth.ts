import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service role key.
 *
 * Only ever constructed inside API routes. The service role bypasses RLS, so
 * every route that uses it must first authenticate the caller with
 * `authenticateRequest` and then scope every query by that user's id.
 */
export function createServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export type AuthenticatedCaller = {
  admin: SupabaseClient;
  userId: string;
  email: string | null;
};

export type AuthResult =
  | { ok: true; caller: AuthenticatedCaller }
  | { ok: false; status: number; error: string };

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

/** Resolves the Supabase user behind a request's bearer token. */
export async function authenticateRequest(request: Request): Promise<AuthResult> {
  const admin = createServiceClient();
  if (!admin) {
    return { ok: false, status: 500, error: "Server Supabase access is not configured." };
  }

  const token = bearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: "Missing authorization token." };
  }

  const {
    data: { user },
    error
  } = await admin.auth.getUser(token);

  if (error || !user) {
    return { ok: false, status: 401, error: "Invalid authorization token." };
  }

  return { ok: true, caller: { admin, userId: user.id, email: user.email ?? null } };
}

/**
 * Same as `authenticateRequest`, but refuses anyone who is not an admin.
 *
 * The books are shared; the settings behind them are not. Connecting Google
 * Drive, choosing the archive folder and disconnecting all act on the one
 * account the whole app archives into, so they stay with whoever owns it.
 */
export async function authenticateAdmin(request: Request): Promise<AuthResult> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth;

  const { data: profile } = await auth.caller.admin
    .from("profiles")
    .select("role")
    .eq("id", auth.caller.userId)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return { ok: false, status: 403, error: "Only an admin can change the archive settings." };
  }

  return auth;
}

"use client";

import { supabase } from "@/lib/supabase";

/** Calls an app API route with the caller's Supabase access token attached. */
export async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) throw new Error("Your session expired. Sign in again.");

  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {})
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as { error?: string }).error || "Something went wrong.");
  }

  return body as T;
}

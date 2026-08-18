import { supabase } from "@/lib/supabase";

export type UserOption = { id: string; label: string };

/**
 * Everyone who has ever signed in, by display name.
 *
 * One request answers both questions the app asks — "who can I filter by" and
 * "whose row is this" — so pages that only need labels build the map from the
 * same list rather than calling a second endpoint.
 */
export async function loadUsers(): Promise<UserOption[]> {
  if (!supabase) return [];

  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session?.access_token) return [];

  try {
    const response = await fetch("/api/users", {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { users?: UserOption[] };
    return body.users ?? [];
  } catch {
    return [];
  }
}

export async function loadUserLabels(): Promise<Record<string, string>> {
  const users = await loadUsers();
  return Object.fromEntries(users.map((user) => [user.id, user.label]));
}

export function labelFor(labels: Record<string, string>, userId: string) {
  return labels[userId] ?? `User ${userId.slice(0, 8)}`;
}

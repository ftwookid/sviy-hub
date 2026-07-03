import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ProfileRow = {
  id: string;
  nickname: string | null;
};

function userDisplayName(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }, profiles: Map<string, string>) {
  const nickname = profiles.get(user.id);
  if (nickname) return nickname;

  const metadataName = user.user_metadata?.name ?? user.user_metadata?.full_name;
  if (typeof metadataName === "string" && metadataName.trim()) return metadataName.trim();

  return user.email || `User ${user.id.slice(0, 8)}`;
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase admin access is not configured." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const {
    data: { user },
    error: userError
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: "Invalid authorization token." }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access is required." }, { status: 403 });
  }

  const [{ data: usersData, error: usersError }, { data: profilesData }] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    }),
    supabaseAdmin.from("profiles").select("id, nickname")
  ]);

  if (usersError) {
    return NextResponse.json({ error: "Could not load users." }, { status: 500 });
  }

  const profiles = new Map(
    ((profilesData ?? []) as ProfileRow[])
      .filter((nextProfile) => typeof nextProfile.nickname === "string" && nextProfile.nickname.trim().length > 0)
      .map((nextProfile) => [nextProfile.id, nextProfile.nickname!.trim()])
  );

  const users = usersData.users
    .map((nextUser) => ({
      id: nextUser.id,
      label: userDisplayName(
        {
          id: nextUser.id,
          email: nextUser.email,
          user_metadata: nextUser.user_metadata as Record<string, unknown>
        },
        profiles
      )
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return NextResponse.json({ users });
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type UserLabelRequest = {
  userIds?: unknown;
};

function uniqueUserIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)));
}

export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => ({}))) as UserLabelRequest;
  const userIds = uniqueUserIds(body.userIds);

  if (userIds.length === 0) {
    return NextResponse.json({ labels: {} });
  }

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (error) {
    return NextResponse.json({ error: "Could not load user labels." }, { status: 500 });
  }

  const requestedIds = new Set(userIds);
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, nickname")
    .in("id", userIds);
  const nicknames = new Map(
    (profiles ?? [])
      .filter((profile) => typeof profile.nickname === "string" && profile.nickname.trim().length > 0)
      .map((profile) => [profile.id as string, profile.nickname.trim() as string])
  );

  const labels = Object.fromEntries(
    data.users
      .filter((owner) => requestedIds.has(owner.id))
      .map((owner) => {
        const metadata = owner.user_metadata as Record<string, unknown>;
        const metadataName = metadata?.name ?? metadata?.full_name;
        const label =
          nicknames.get(owner.id) ||
          owner.email ||
          (typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : `User ${owner.id.slice(0, 8)}`);

        return [owner.id, label];
      })
  );

  return NextResponse.json({ labels });
}

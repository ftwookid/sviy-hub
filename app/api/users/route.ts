import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";

type ProfileRow = {
  id: string;
  nickname: string | null;
};

/**
 * Everyone signed in gets the same list of people, because everyone now sees
 * the same rows and every row is labelled with who logged it. A name is not a
 * privileged fact here; it is how you tell two halves of the books apart.
 *
 * It still needs the service role: nicknames live in `profiles`, but the
 * fallbacks — email, metadata name — are only reachable through the auth admin
 * API. So the route authenticates the caller and returns nothing else.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { admin } = auth.caller;

  const [{ data: usersData, error: usersError }, { data: profilesData }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("profiles").select("id, nickname")
  ]);

  if (usersError) {
    return NextResponse.json({ error: "Could not load users." }, { status: 500 });
  }

  const nicknames = new Map(
    ((profilesData ?? []) as ProfileRow[])
      .filter((profile) => typeof profile.nickname === "string" && profile.nickname.trim().length > 0)
      .map((profile) => [profile.id, profile.nickname!.trim()])
  );

  const users = usersData.users
    .map((user) => {
      const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
      const metadataName = metadata.name ?? metadata.full_name;
      return {
        id: user.id,
        label:
          nicknames.get(user.id) ||
          (typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : "") ||
          user.email ||
          `User ${user.id.slice(0, 8)}`
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return NextResponse.json({ users });
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { SetupNotice } from "@/components/SetupNotice";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function OnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;

    client.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      if (!data.user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await client
        .from("profiles")
        .select("nickname")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!active) return;
      setUserId(data.user.id);
      setNickname(profile?.nickname ?? "");
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [router]);

  async function saveNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !userId) return;

    const nextNickname = nickname.trim();
    if (!nextNickname) {
      setError("Enter a nickname.");
      return;
    }

    setSaving(true);
    setError("");

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ nickname: nextNickname, updated_at: new Date().toISOString() })
      .eq("id", userId);

    setSaving(false);

    if (updateError) {
      setError("Could not save your nickname.");
      return;
    }

    router.replace("/");
  }

  if (!isSupabaseConfigured) return <SetupNotice />;

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <form
        onSubmit={saveNickname}
        className="w-full max-w-[440px] rounded-xl border border-border bg-surface p-5 shadow-card"
      >
        <div>
          <Image src="/Logo v2.png" alt="Sviy Hub" width={112} height={112} className="h-28 w-28 object-contain" priority />
          <h1 className="mt-5 text-[24px] font-medium leading-tight text-text-primary">Set your nickname</h1>
          <p className="mt-2 text-[15px] text-text-secondary">
            This is how your work will be labeled inside the family hub.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <Input
            label="Nickname"
            value={nickname}
            placeholder="Yani"
            disabled={loading}
            onChange={(event) => setNickname(event.target.value)}
            required
          />
          {error ? <p className="text-[12px] text-danger">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={loading || saving}>
            {saving ? "Saving..." : "Continue"}
          </Button>
        </div>
      </form>
    </main>
  );
}

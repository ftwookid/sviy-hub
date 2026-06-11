"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { SetupNotice } from "@/components/SetupNotice";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setLoading(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (signInError) {
      setError("That email and password did not work.");
      return;
    }

    router.replace("/");
  }

  if (!isSupabaseConfigured) return <SetupNotice />;

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <form
        onSubmit={signIn}
        className="w-full max-w-[400px] rounded-xl border border-border bg-surface p-5 shadow-card"
      >
        <div className="text-center">
          <div className="font-serif text-[32px] italic leading-[1.3] text-accent">Yani</div>
          <p className="mt-1 text-[13px] text-text-secondary">Business expenses, organized.</p>
        </div>
        <div className="mt-8 space-y-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error ? <p className="text-[12px] text-danger">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </div>
      </form>
    </main>
  );
}

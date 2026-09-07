"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { SetupNotice } from "@/components/SetupNotice";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      setLoading(false);

      if (signUpError) {
        setError("Could not create that account.");
        return;
      }

      if (!data.session) {
        setMessage("Check your email to finish signing up.");
        return;
      }

      router.replace("/onboarding");
      return;
    }

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
    <main className="grid min-h-viewport place-items-center px-4 py-10">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[400px] rounded-xl border border-border bg-surface p-5 shadow-card"
      >
        <div className="flex flex-col items-center text-center">
          <Image src="/Logo v2.png" alt="Sviy Hub" width={128} height={128} className="h-32 w-32 object-contain" priority />
          <p className="mt-2 text-[15px] text-text-secondary">
            {mode === "signup" ? "Create your private account." : "Clients, pets, and expenses, softly organized."}
          </p>
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
          {message ? <p className="text-[12px] text-success">{message}</p> : null}
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? (mode === "signup" ? "Creating account..." : "Signing in...") : mode === "signup" ? "Create account" : "Sign in"}
          </Button>
          <button
            className="w-full rounded-xl px-3 py-2 text-[14px] font-medium text-text-secondary transition hover:bg-subtle"
            type="button"
            onClick={() => {
              setMode((current) => (current === "signin" ? "signup" : "signin"));
              setError("");
              setMessage("");
            }}
          >
            {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Sign up"}
          </button>
        </div>
      </form>
    </main>
  );
}

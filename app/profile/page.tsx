"use client";

import { LogOut, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";

export default function ProfilePage() {
  const { user, authLoading } = useAuthUser();

  async function signOut() {
    await supabase?.auth.signOut();
    window.location.href = "/login";
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      <div className="space-y-7">
        <header>
          <h1 className="text-[38px] font-medium leading-[1.06] tracking-[-0.01em] text-text-primary">Profile</h1>
          <p className="mt-2 max-w-xl text-[16px] text-text-secondary">A quiet place for account details and future settings.</p>
        </header>

        <section className="rounded-[24px] border border-border bg-surface p-5 shadow-card">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-[20px] font-medium text-text-primary">
              {user.email?.[0]?.toUpperCase() ?? "S"}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-tertiary">Signed in as</div>
              <div className="truncate text-[18px] font-medium text-text-primary">{user.email}</div>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-border bg-surface p-5 shadow-card">
          <div className="flex items-center gap-3">
            <Sparkles size={19} strokeWidth={1.6} className="text-accent" />
            <div>
              <div className="text-[15px] font-medium text-text-primary">Sviy Hub</div>
              <div className="text-[13px] text-text-secondary">Version 0.1.0</div>
            </div>
          </div>
          <div className="mt-5 rounded-2xl bg-subtle p-4 text-[14px] text-text-secondary">
            Future settings will live here: notification preferences, tax-year defaults, export options, and profile details.
          </div>
        </section>

        <Button variant="danger" onClick={signOut}>
          <LogOut size={18} strokeWidth={1.6} />
          Sign out
        </Button>
      </div>
    </AppShell>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { DriveArchiveCard } from "@/components/expenses/DriveArchiveCard";
import { VehicleSettingsCard } from "@/components/VehicleSettingsCard";
import { Button } from "@/components/ui/Button";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import versionData from "@/version.json";

export default function ProfilePage() {
  const { user, isAdmin, authLoading } = useAuthUser();
  const [pendingDriveCount, setPendingDriveCount] = useState(0);

  // The archive settings live here now, so the backlog count has to be read
  // here too rather than handed down from the transactions page.
  const loadPendingCount = useCallback(async () => {
    if (!supabase || !user) return;

    const { count } = await supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .is("drive_file_id", null)
      .not("storage_path", "is", null);
    setPendingDriveCount(count ?? 0);
  }, [user]);

  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  async function signOut() {
    await supabase?.auth.signOut();
    window.location.href = "/login";
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      <div className="space-y-4">
        <h1 className="text-[22px] font-medium leading-tight tracking-[-0.01em] text-text-primary sm:text-[26px]">
          Profile
        </h1>

        <section className="rounded-[20px] border border-border bg-surface p-3.5 shadow-card">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-[17px] font-medium text-text-primary">
              {user.email?.[0]?.toUpperCase() ?? "S"}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
                Signed in as
              </div>
              <div className="truncate text-[15px] font-medium text-text-primary">{user.email}</div>
            </div>
            {/* The books are shared; the role is not. This is the only place the
                difference is visible, and the only thing it still governs. */}
            {isAdmin ? (
              <span className="ml-auto shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-text-primary">
                Admin
              </span>
            ) : null}
          </div>
        </section>

        {/* Archive setup belongs with the settings, not in the middle of the
            month's transactions. The transactions page only nudges when the
            archive actually needs a hand. */}
        <DriveArchiveCard pendingCount={pendingDriveCount} isAdmin={isAdmin} />

        {isAdmin ? <VehicleSettingsCard userId={user.id} /> : null}

        <section className="rounded-[20px] border border-border bg-surface p-3.5 shadow-card">
          <div className="flex items-center gap-3">
            <Image
              src="/Logo v2.png"
              alt="Sviy Hub"
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
            />
            <div className="text-[13px] text-text-secondary">Version {versionData.version}</div>
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

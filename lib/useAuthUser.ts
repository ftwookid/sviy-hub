"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type UserRole = "admin" | "user";

export function useAuthUser() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>("user");
  const [authLoading, setAuthLoading] = useState(true);

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
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!active) return;
      setUser(data.user);
      setRole(profile?.role === "admin" ? "admin" : "user");
      setAuthLoading(false);
    });

    return () => {
      active = false;
    };
  }, [router]);

  return { user, role, isAdmin: role === "admin", authLoading };
}

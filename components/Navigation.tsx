"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/cn";

type NavigationProps = {
  email?: string | null;
};

export function Navigation({ email }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initial = email?.[0]?.toUpperCase() ?? "Y";

  async function logout() {
    await supabase?.auth.signOut();
    router.replace("/login");
  }

  const linkClass = (href: string) =>
    cn(
      "rounded-md px-3 py-2 text-[13px] transition duration-150 ease-in-out hover:bg-subtle",
      pathname === href ? "text-text-primary" : "text-text-secondary"
    );

  return (
    <header className="border-b border-border bg-surface">
      <nav className="mx-auto flex h-16 max-w-[780px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="font-serif text-[20px] italic text-accent">
          Yani
        </Link>

        <div className="hidden items-center gap-1 sm:flex">
          <Link className={linkClass("/")} href="/">
            Expenses
          </Link>
          <Link className={linkClass("/reports")} href="/reports">
            Reports
          </Link>
          <button
            aria-label="Sign out"
            className="group ml-3 flex h-9 items-center gap-2 rounded-full border border-border bg-surface pl-2 pr-2 transition hover:bg-subtle"
            onClick={logout}
            type="button"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-[12px] font-medium text-text-primary">
              {initial}
            </span>
            <LogOut
              size={15}
              strokeWidth={1.5}
              className="text-text-tertiary opacity-0 transition group-hover:opacity-100"
            />
          </button>
        </div>

        <button
          aria-label="Toggle menu"
          className="focus-ring rounded-md p-2 text-text-secondary transition hover:bg-subtle sm:hidden"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
        </button>
      </nav>

      {open ? (
        <div className="border-t border-border bg-surface px-4 py-3 sm:hidden">
          <div className="mx-auto flex max-w-[780px] items-center justify-between">
            <div className="flex gap-1">
              <Link className={linkClass("/")} href="/" onClick={() => setOpen(false)}>
                Expenses
              </Link>
              <Link className={linkClass("/reports")} href="/reports" onClick={() => setOpen(false)}>
                Reports
              </Link>
            </div>
            <button
              className="focus-ring rounded-md p-2 text-text-secondary transition hover:bg-subtle"
              onClick={logout}
              type="button"
            >
              <LogOut size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}

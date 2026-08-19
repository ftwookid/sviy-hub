"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { HeartPulse, Receipt, UserRound, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";

const navItems = [
  { label: "Taxes", href: "/", icon: Receipt },
  { label: "Clients", href: "/clients", icon: UsersRound },
  { label: "Health", href: "/health", icon: HeartPulse },
  { label: "Profile", href: "/profile", icon: UserRound }
];

// Everything that lowers the tax bill — what was spent, what was driven, what
// the car costs, and the year's totals — is one section spread over several
// routes. Each has to light up the same nav item, or a page like /reports
// leaves the sidebar with nothing selected at all.
const TAX_ROUTES = ["/", "/reports", "/import", "/mileage", "/car"];

function isActive(pathname: string, href: string) {
  if (href === "/") return TAX_ROUTES.includes(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const initial = user.email?.[0]?.toUpperCase() ?? "S";
  const isClientDetailPage = /^\/clients\/[^/]+$/.test(pathname);

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-page text-text-primary md:grid md:grid-cols-[240px_1fr]">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-border bg-[#F7F4EE]/90 px-4 py-5 backdrop-blur-xl md:flex md:flex-col">
        <Link href="/" className="flex h-36 w-36 items-center justify-center self-center rounded-xl">
          <Image src="/Logo v2.png" alt="Sviy Hub" width={144} height={144} className="h-36 w-36 object-contain" priority />
        </Link>
        <nav className="mt-8 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex min-h-11 items-center gap-3 rounded-2xl py-2 pl-4 pr-3 text-[15px] transition duration-150 ease-out",
                  active
                    ? "bg-accent-soft font-semibold text-text-primary ring-1 ring-inset ring-accent/45"
                    : "font-medium text-text-secondary hover:bg-surface/80 hover:text-text-primary"
                )}
              >
                {/* A gold marker on the edge, so the selected section reads at a glance. */}
                {active ? (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent"
                  />
                ) : null}
                <Icon
                  size={20}
                  strokeWidth={active ? 2 : 1.6}
                  className={active ? "text-accent" : "text-text-tertiary transition group-hover:text-text-secondary"}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl border border-border bg-surface/72 p-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-[14px] font-medium text-text-primary">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-text-primary">{user.email}</div>
              <button
                className="mt-0.5 text-[12px] text-text-tertiary transition hover:text-text-secondary"
                onClick={signOut}
                type="button"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="md:col-start-2">
        <main
          className={cn(
            "mx-auto min-h-screen w-full max-w-[980px] px-4 pt-6 transition-opacity duration-200 ease-in-out sm:px-6 md:px-8 md:pb-10 md:pt-8",
            isClientDetailPage
              ? "pb-[calc(72px+env(safe-area-inset-bottom))]"
              : "pb-[calc(96px+env(safe-area-inset-bottom))]"
          )}
        >
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-50 rounded-[24px] border border-white/70 bg-surface/78 px-2 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 shadow-[0_18px_48px_rgba(80,66,44,0.16)] backdrop-blur-2xl md:hidden">
        <div className="grid grid-cols-4 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[18px] text-[11px] transition duration-150 ease-out",
                  active
                    ? "bg-accent-soft font-semibold text-accent ring-1 ring-inset ring-accent/45"
                    : "font-medium text-text-tertiary hover:bg-subtle hover:text-text-secondary"
                )}
              >
                <Icon size={21} strokeWidth={active ? 2.1 : 1.6} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

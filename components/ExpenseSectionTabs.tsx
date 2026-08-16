"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function ExpenseSectionTabs() {
  const pathname = usePathname();
  const tabs = [
    { label: "Expenses", href: "/" },
    { label: "Import", href: "/import" },
    { label: "Reports", href: "/reports" }
  ];

  return (
    <div className="inline-grid min-h-11 grid-cols-3 rounded-2xl border border-border bg-subtle p-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex min-h-9 items-center justify-center rounded-xl px-4 text-[14px] font-medium transition duration-150 ease-out",
              active ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

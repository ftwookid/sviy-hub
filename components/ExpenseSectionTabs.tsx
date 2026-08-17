"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Two tabs, not three. Entering transactions and importing them off a statement
 * are the same job on the same month, so they share one page; Reports is a
 * different question asked of a whole year, so it keeps its own.
 */
export function ExpenseSectionTabs() {
  const pathname = usePathname();
  const tabs = [
    { label: "Transactions", href: "/" },
    { label: "Reports", href: "/reports" }
  ];

  return (
    <div className="inline-flex h-9 shrink-0 rounded-xl border border-border bg-subtle p-0.5">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-ring flex items-center justify-center rounded-[10px] px-3.5 text-[13px] font-medium transition duration-150 ease-out",
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Deductions is one section, four questions. What you spent, what you drove,
 * what the driving costs, and what the year adds up to — the same books, so
 * they share a nav item rather than competing for one at the top level.
 */
const TABS = [
  { label: "Transactions", href: "/", match: ["/", "/import"] },
  { label: "Mileage", href: "/mileage", match: ["/mileage"] },
  { label: "Car", href: "/car", match: ["/car"] },
  { label: "Reports", href: "/reports", match: ["/reports"] }
];

export function SectionTabs() {
  const pathname = usePathname();

  return (
    <div className="grid grid-cols-4 gap-0.5 rounded-xl border border-border bg-subtle p-0.5">
      {TABS.map((tab) => {
        const active = tab.match.includes(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-ring flex min-h-9 items-center justify-center rounded-[10px] px-2 text-[13px] font-medium transition duration-150 ease-out",
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

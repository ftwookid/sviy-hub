"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Finances is one section, two jobs. Reading the month, and setting the standing
 * figures the month is built from.
 *
 * They are split because a schedule is not a number: a line carries a dated
 * history now, and editing that history inside the card you read the month from
 * would bury the answer under the question. Two tabs, one row — the same shape
 * the Taxes tabs already use.
 */
const TABS = [
  { label: "Month", href: "/finances", match: ["/finances"] },
  { label: "Setup", href: "/finances/setup", match: ["/finances/setup"] }
];

export function FinanceTabs() {
  const pathname = usePathname();

  return (
    <div className="grid grid-cols-2 gap-0.5 rounded-xl border border-border bg-subtle p-0.5">
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

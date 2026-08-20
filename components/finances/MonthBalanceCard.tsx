"use client";

import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import { shareOfIncome } from "@/lib/finances";
import type { MonthFinances } from "@/types/finance";

/**
 * The one number the section exists to produce: what is left of the month once
 * everything the household committed to has gone out.
 *
 * Money in and money out sit under it, and a single bar splits the income into
 * where it went. No sentence tells the reader what to conclude — the figures go
 * up, the reader draws the conclusion.
 */

const SEGMENTS: Array<{ key: string; label: string; color: string }> = [
  { key: "Tax Withheld", label: "Tax", color: "bg-[#8C8579]" },
  { key: "Deductions", label: "Business", color: "bg-accent" },
  { key: "Needs", label: "Needs", color: "bg-[#D8C7A5]" },
  { key: "Debt", label: "Debt", color: "bg-[#B87B6B]" },
  { key: "Investments & Savings", label: "Saved", color: "bg-[#7FA890]" }
];

export function MonthBalanceCard({ month, monthLabel }: { month: MonthFinances; monthLabel: string }) {
  const short = month.leftOver < 0;
  const outgoing = month.sections.filter((section) => section.direction === "out");
  const spokenFor = outgoing.reduce((sum, section) => sum + section.total, 0);
  const unallocated = Math.max(0, month.moneyIn - spokenFor);

  return (
    <section
      className={cn(
        "rounded-[20px] border p-4 shadow-card",
        short ? "border-danger/25 bg-[#FBEFEF]" : "border-border bg-[#F5EFE3]"
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
        {short ? `Short in ${monthLabel}` : `Left over in ${monthLabel}`}
      </div>
      <div
        className={cn(
          "mt-2.5 text-[30px] font-medium leading-none tracking-[-0.01em]",
          short ? "text-danger" : "text-text-primary"
        )}
      >
        {formatCurrency(Math.abs(month.leftOver))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-text-secondary">
        <span>{formatCurrency(month.moneyIn)} in</span>
        <span>{formatCurrency(month.moneyOut)} out</span>
        {month.mileageDeduction > 0 ? (
          <span className="text-text-tertiary">{formatCurrency(month.mileageDeduction)} mileage deduction</span>
        ) : null}
      </div>

      {month.moneyIn > 0 ? (
        <>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-white/70">
            {SEGMENTS.map((segment) => {
              const section = outgoing.find((row) => row.key === segment.key);
              const share = shareOfIncome(section?.total ?? 0, month.moneyIn);
              if (share <= 0) return null;
              return (
                <div
                  key={segment.key}
                  className={cn("h-full transition-all duration-200 ease-in-out", segment.color)}
                  style={{ width: `${share * 100}%` }}
                />
              );
            })}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-text-tertiary">
            {SEGMENTS.map((segment) => {
              const section = outgoing.find((row) => row.key === segment.key);
              if (!section || section.total <= 0) return null;
              return (
                <span key={segment.key} className="inline-flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", segment.color)} />
                  {segment.label} {Math.round(shareOfIncome(section.total, month.moneyIn) * 100)}%
                </span>
              );
            })}
            {unallocated > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-white/70 ring-1 ring-inset ring-border" />
                Left {Math.round(shareOfIncome(unallocated, month.moneyIn) * 100)}%
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

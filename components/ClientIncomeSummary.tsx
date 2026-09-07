"use client";

import { clientIncomeTotals } from "@/lib/clients";
import type { ClientWithPets } from "@/types/client";

/**
 * What the regular book is worth, in one strip above the list.
 *
 * Deliberately short: three numbers on one line, no chart and no caption. The
 * Performance tab is where the same money gets taken apart; here it is only
 * worth knowing the size of what you are scrolling through.
 *
 * Paused clients are left out wherever the filter stands — they earn nothing,
 * and folding them in would quietly overstate the All view.
 */
export function ClientIncomeSummary({ clients }: { clients: ClientWithPets[] }) {
  const active = clients.filter((client) => client.status === "Active");
  if (active.length === 0) return null;

  const totals = clientIncomeTotals(active);

  return (
    <section className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      <Figure label="Weekly" value={totals.weekly} />
      <Figure label="Monthly" value={totals.monthly} />
      <Figure label="Annual" value={totals.annual} />
    </section>
  );
}

/** Whole dollars: these are estimates, and cents would only crowd the row. */
const wholeDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-2.5 sm:px-4">
      <div className="text-caption font-medium uppercase tracking-[0.05em] text-text-tertiary">
        {label}
      </div>
      <div className="mt-0.5 text-figure font-semibold leading-tight tabular-nums text-text-primary">
        {wholeDollars.format(value)}
      </div>
    </div>
  );
}

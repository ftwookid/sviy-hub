"use client";

import { Link2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import { shareOfIncome } from "@/lib/finances";
import type { FinanceRow, FinanceSection } from "@/types/finance";

/**
 * One bucket of the month: its rows, its total, and its share of what came in.
 *
 * Read-only, all of it. Typed figures are dated schedules now and live in Setup;
 * a pencil here would have to mean "change it from when?", which is a question
 * the month you are looking at cannot answer.
 */

function SourceBadge({ source }: { source: FinanceRow["source"] }) {
  if (source === "Manual") return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary">
      <Link2 size={10} strokeWidth={2} />
      {source}
    </span>
  );
}

function Row({ row }: { row: FinanceRow }) {
  return (
    <div className="flex min-h-11 items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-[14px]",
              row.informational ? "text-text-tertiary" : "text-text-primary"
            )}
          >
            {row.label}
          </span>
          <SourceBadge source={row.source} />
        </div>
        {row.hint ? <div className="mt-0.5 truncate text-[11.5px] text-text-tertiary">{row.hint}</div> : null}
      </div>
      <div
        className={cn(
          "shrink-0 text-right text-[14px] font-medium tabular-nums",
          row.informational ? "text-text-tertiary" : "text-text-primary"
        )}
      >
        {formatCurrency(row.amount)}
      </div>
    </div>
  );
}

export function BucketCard({
  section,
  title,
  blurb,
  moneyIn
}: {
  section: FinanceSection;
  title: string;
  blurb: string;
  moneyIn: number;
}) {
  const share = shareOfIncome(section.total, moneyIn);
  const isIncome = section.direction === "in";

  return (
    <section className="rounded-[20px] border border-border bg-surface p-3.5 shadow-card">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-medium leading-tight text-text-primary">{title}</h2>
          <p className="mt-0.5 text-[12px] text-text-tertiary">{blurb}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[17px] font-medium leading-none tabular-nums text-text-primary">
            {formatCurrency(section.total)}
          </div>
          {!isIncome && share > 0 ? (
            <div className="mt-1 text-[11px] text-text-tertiary">{Math.round(share * 100)}% of income</div>
          ) : null}
        </div>
      </div>

      <div className="mt-2 divide-y divide-border/70 border-t border-border/70 pt-1">
        {section.rows.length === 0 ? (
          <div className="py-3 text-[13px] text-text-tertiary">Nothing set up yet.</div>
        ) : (
          section.rows.map((row) => <Row key={row.key} row={row} />)
        )}
      </div>
    </section>
  );
}

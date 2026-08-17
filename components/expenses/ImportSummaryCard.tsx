"use client";

import { CircleCheck, CircleHelp, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import { periodMonthLabel } from "@/lib/expenses";
import { reconciliationOf } from "@/lib/statementImports";
import type { StatementImport } from "@/types/statementImport";

/**
 * What the scan believes it read, and whether the arithmetic holds.
 *
 * The point of showing this is trust: if the extracted total matches the total
 * the statement printed on itself, nothing was dropped or invented. When they
 * disagree — or the statement printed no total to check — that is said plainly
 * rather than hidden behind a green tick.
 */
export function ImportSummaryCard({
  statementImport,
  ownerLabel
}: {
  statementImport: StatementImport;
  ownerLabel?: string;
}) {
  const reconciliation = reconciliationOf(statementImport.reconciliation);
  const balanced = reconciliation?.balanced ?? null;

  const tone =
    balanced === true ? "success" : balanced === false ? "danger" : "neutral";
  const Icon = balanced === true ? CircleCheck : balanced === false ? TriangleAlert : CircleHelp;

  const headline =
    balanced === true
      ? "Totals match the statement"
      : balanced === false
        ? "Totals do not match the statement"
        : "The statement printed no total to check against";

  const detail =
    balanced === false && reconciliation
      ? `The statement says ${formatCurrency(
          reconciliation.statedTotalDebits ?? 0
        )} went out; these rows add up to ${formatCurrency(
          reconciliation.extractedTotalDebits
        )}. Check for a transaction that was missed or read twice before you import.`
      : balanced === true
        ? "Every transaction on the statement is accounted for in this list."
        : "Go through the list yourself — there was nothing to cross-check the scan against.";

  // When the arithmetic holds there is nothing to act on, so it collapses to a
  // single line. The explanation is only worth its height when something is off.
  const settled = balanced === true;

  return (
    <section className="rounded-[20px] border border-border bg-surface px-3.5 py-3 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-medium text-text-primary">
            {statementImport.institution || "Statement"}
            {statementImport.account_label ? ` · ${statementImport.account_label}` : ""}
          </h2>
          <p className="truncate text-[12.5px] text-text-secondary">
            {statementImport.period_month
              ? periodMonthLabel(statementImport.period_month)
              : statementImport.filename}
            {ownerLabel ? ` · ${ownerLabel}` : ""}
            {reconciliation
              ? ` · ${formatCurrency(reconciliation.extractedTotalDebits)} scanned out`
              : ""}
          </p>
        </div>

        {settled ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11.5px] font-medium text-success">
            <Icon size={13} strokeWidth={2} />
            Totals match
          </span>
        ) : null}
      </div>

      {!settled ? (
        <div
          className={cn(
            "mt-2.5 flex items-start gap-2.5 rounded-xl px-3 py-2.5",
            tone === "danger" ? "bg-danger-soft" : "bg-subtle"
          )}
        >
          <Icon
            size={16}
            strokeWidth={1.8}
            className={cn(
              "mt-0.5 shrink-0",
              tone === "danger" ? "text-danger" : "text-text-tertiary"
            )}
          />
          <div className="min-w-0">
            <p
              className={cn(
                "text-[13px] font-medium",
                tone === "danger" ? "text-danger" : "text-text-secondary"
              )}
            >
              {headline}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-text-secondary">{detail}</p>
            {reconciliation?.notes ? (
              <p className="mt-1 text-[12px] text-text-tertiary">{reconciliation.notes}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

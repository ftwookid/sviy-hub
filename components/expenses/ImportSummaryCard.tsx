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

  return (
    <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[19px] font-medium text-text-primary">
            {statementImport.institution || "Statement"}
            {statementImport.account_label ? ` · ${statementImport.account_label}` : ""}
          </h2>
          <p className="mt-1 text-[13px] text-text-secondary">
            {statementImport.period_month
              ? periodMonthLabel(statementImport.period_month)
              : statementImport.filename}
            {ownerLabel ? ` · ${ownerLabel}` : ""}
          </p>
        </div>
        {reconciliation ? (
          <div className="text-right">
            <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
              Scanned out
            </div>
            <div className="text-[21px] font-medium leading-none text-text-primary">
              {formatCurrency(reconciliation.extractedTotalDebits)}
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "mt-4 flex items-start gap-2.5 rounded-2xl px-3 py-3",
          tone === "success" && "bg-success-soft",
          tone === "danger" && "bg-danger-soft",
          tone === "neutral" && "bg-subtle"
        )}
      >
        <Icon
          size={17}
          strokeWidth={1.8}
          className={cn(
            "mt-0.5 shrink-0",
            tone === "success" && "text-success",
            tone === "danger" && "text-danger",
            tone === "neutral" && "text-text-tertiary"
          )}
        />
        <div className="min-w-0">
          <p
            className={cn(
              "text-[13px] font-medium",
              tone === "success" && "text-success",
              tone === "danger" && "text-danger",
              tone === "neutral" && "text-text-secondary"
            )}
          >
            {headline}
          </p>
          <p className="mt-1 text-[13px] text-text-secondary">{detail}</p>
          {reconciliation?.notes ? (
            <p className="mt-1.5 text-[12px] text-text-tertiary">{reconciliation.notes}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

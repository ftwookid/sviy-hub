"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, CircleAlert, FileSpreadsheet, MinusCircle } from "lucide-react";
import { CategoryTag } from "@/components/CategoryTag";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatCurrency, formatShortDate } from "@/lib/formatters";
import { attachProofSheet } from "@/lib/proofSheetClient";
import { reportPeriodDate } from "@/lib/proofSheets";
import { formatBytes } from "@/lib/receiptImage";
import type { ProofSheetMatch, ProofSheetScan } from "@/types/proofSheet";

/**
 * Confirming what a vendor report proves, before it proves anything.
 *
 * The matching is arithmetic — same amount, near enough date — but arithmetic
 * can still staple a parking report to a coffee that happened to cost $2.10 on
 * the same afternoon. So every match is shown with both halves side by side and
 * a tick the user can take off, and nothing is uploaded until they say so.
 *
 * Everything starts ticked. The common case is a clean month where all fifty
 * lines matched, and asking someone to tick fifty boxes to confirm what the app
 * already worked out is not a review, it is data entry.
 */
export function ProofSheetReview({
  file,
  scan,
  userId,
  onBack,
  onAttached,
  showToast
}: {
  file: File;
  scan: ProofSheetScan;
  userId: string;
  onBack: () => void;
  onAttached: (outcome: { count: number; periodDate: string }) => void;
  showToast: (message: string) => void;
}) {
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState("");

  const chosen = useMemo(
    () => scan.matches.filter((match) => !excludedIds.has(match.expense.id)),
    [excludedIds, scan.matches]
  );

  const chosenTotal = useMemo(
    () => chosen.reduce((total, match) => total + Number(match.expense.amount), 0),
    [chosen]
  );

  const allChosen = chosen.length === scan.matches.length;

  function toggleAll() {
    setExcludedIds(allChosen ? new Set(scan.matches.map((match) => match.expense.id)) : new Set());
  }

  function toggleOne(expenseId: string, included: boolean) {
    setExcludedIds((current) => {
      const next = new Set(current);
      if (included) next.delete(expenseId);
      else next.add(expenseId);
      return next;
    });
  }

  async function handleAttach() {
    if (chosen.length === 0) return;

    setAttaching(true);
    setError("");
    try {
      // The file is filed under the month its charges fall in, not the month
      // that happens to be on screen.
      const periodDate =
        reportPeriodDate(chosen, chosen.map((match) => match.line)) ?? chosen[0].expense.date;

      await attachProofSheet(
        file,
        userId,
        chosen.map((match) => match.expense.id),
        periodDate
      );

      onAttached({ count: chosen.length, periodDate });
    } catch (attachError) {
      const message =
        attachError instanceof Error ? attachError.message : "That report could not be attached.";
      setError(message);
      showToast(message);
    } finally {
      setAttaching(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        className="focus-ring inline-flex items-center gap-1.5 text-[13px] text-text-secondary transition hover:text-text-primary"
        type="button"
        onClick={onBack}
      >
        <ArrowLeft size={15} strokeWidth={1.9} />
        Back to transactions
      </button>

      <div className="rounded-[18px] border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-accent-soft text-accent">
            <FileSpreadsheet size={18} strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-medium text-text-primary">
              {scan.vendor || file.name}
            </h2>
            <p className="mt-0.5 truncate text-[12.5px] text-text-tertiary">
              {file.name} · {formatBytes(file.size)}
              {scan.periodStart && scan.periodEnd
                ? ` · ${formatShortDate(scan.periodStart)} – ${formatShortDate(scan.periodEnd)}`
                : ""}
            </p>
          </div>
        </div>

        <p className="mt-3 text-[13.5px] leading-snug text-text-secondary">
          {scan.lineCount} charge{scan.lineCount === 1 ? "" : "s"} on this report.{" "}
          <span className="text-text-primary">
            {scan.matches.length} matched a transaction with no proof yet
          </span>
          {scan.unmatchedCount > 0
            ? `, and ${scan.unmatchedCount} had nothing in your books to match.`
            : "."}
        </p>

        {scan.notes ? (
          <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-subtle px-3 py-2 text-[12.5px] leading-snug text-text-secondary">
            <CircleAlert size={14} strokeWidth={1.8} className="mt-px shrink-0 text-text-tertiary" />
            {scan.notes}
          </p>
        ) : null}
      </div>

      {scan.matches.length === 0 ? (
        <div className="rounded-[18px] border border-border bg-surface px-4 py-8 text-center">
          <p className="text-[14px] text-text-secondary">
            Nothing on this report lines up with a transaction that still needs proof.
          </p>
          <Button className="mt-4" variant="soft" type="button" onClick={onBack}>
            Back to transactions
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            <label className="focus-ring-within inline-flex cursor-pointer items-center gap-2 text-[13px] text-text-secondary">
              <input
                className="h-4 w-4 accent-accent"
                type="checkbox"
                checked={allChosen}
                onChange={toggleAll}
              />
              Select all
            </label>
            <span className="text-[12.5px] text-text-tertiary">
              {chosen.length} of {scan.matches.length} · {formatCurrency(chosenTotal)}
            </span>
          </div>

          <div className="overflow-hidden rounded-[18px] border border-border bg-surface">
            {scan.matches.map((match, index) => (
              <MatchRow
                key={match.expense.id}
                match={match}
                included={!excludedIds.has(match.expense.id)}
                first={index === 0}
                onToggle={(included) => toggleOne(match.expense.id, included)}
              />
            ))}
          </div>

          {error ? (
            <p className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>
          ) : null}

          <div className="sticky bottom-[calc(12px+env(safe-area-inset-bottom))] z-10 pt-1">
            <Button
              className="w-full shadow-[0_10px_30px_rgba(48,38,24,0.18)]"
              variant="accent"
              type="button"
              disabled={attaching || chosen.length === 0}
              onClick={handleAttach}
            >
              {attaching
                ? "Attaching..."
                : `Use as proof for ${chosen.length} transaction${chosen.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One proposed match: the transaction on top, the line that proves it beneath.
 *
 * The report line is worth showing in full. "Downtown 2 HR · 944PML" is what
 * makes a $2.10 charge recognisable as the parking it was, and it is the only
 * thing on screen that can tell the user the match is wrong.
 */
function MatchRow({
  match,
  included,
  first,
  onToggle
}: {
  match: ProofSheetMatch;
  included: boolean;
  first: boolean;
  onToggle: (included: boolean) => void;
}) {
  const { expense, line, dayGap } = match;

  return (
    <label
      className={cn(
        "focus-ring-within flex cursor-pointer items-start gap-3 px-3 py-2.5 transition",
        !first && "border-t border-border",
        included ? "bg-surface hover:bg-subtle" : "bg-page opacity-55"
      )}
    >
      <input
        className="mt-1 h-4 w-4 shrink-0 accent-accent"
        type="checkbox"
        checked={included}
        onChange={(event) => onToggle(event.target.checked)}
      />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="w-[46px] shrink-0 text-[12.5px] text-text-tertiary">
            {formatShortDate(expense.date)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[14.5px] text-text-primary">
            {expense.merchant}
          </span>
          <span className="shrink-0 text-[14.5px] tabular-nums text-text-primary">
            {formatCurrency(expense.amount)}
          </span>
        </span>

        <span className="mt-1 flex items-center gap-2">
          <span className="w-[46px] shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[12px] text-text-tertiary">
            Report row {line.row}
            {dayGap === 0 ? "" : ` · ${formatShortDate(line.date)}`}
            {line.description ? ` · ${line.description}` : ""}
          </span>
          {expense.proof === "Waived" ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#F1F0ED] px-2 py-0.5 text-[11px] font-medium text-text-tertiary">
              <MinusCircle size={11} strokeWidth={2} />
              Was waived
            </span>
          ) : null}
          <CategoryTag category={expense.category} />
        </span>
      </span>
    </label>
  );
}

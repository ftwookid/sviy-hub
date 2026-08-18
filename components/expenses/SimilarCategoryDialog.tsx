"use client";

import { useMemo, useState } from "react";
import { CategoryTag } from "@/components/CategoryTag";
import { Button } from "@/components/ui/Button";
import { CloseButton } from "@/components/ui/CloseButton";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { cn } from "@/lib/cn";
import { normalizeCategory } from "@/lib/categories";
import { formatCurrency, parseLocalDate } from "@/lib/formatters";
import type { CategorisableRow } from "@/lib/statementImports";

function shortDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    parseLocalDate(value)
  );
}

/**
 * Offered after a single category edit, when the same payee appears elsewhere
 * on the statement.
 *
 * Deliberately opt-in per row rather than an automatic sweep: "Chewy" is always
 * Supplies, but a card can carry two unrelated charges under one descriptor, and
 * silently rewriting the one the user did not mean is worse than asking. Rows
 * already sitting in the chosen category are not offered — there is nothing to
 * change — so this never appears with an empty list.
 */
export function SimilarCategoryDialog({
  category,
  rows,
  onApply,
  onDismiss
}: {
  category: string;
  rows: CategorisableRow[];
  onApply: (rowIds: string[]) => void;
  onDismiss: () => void;
}) {
  // Pre-ticked: the common case is that they are all the same merchant and all
  // want the same category, so the fast path should be one tap.
  const [checked, setChecked] = useState<Set<string>>(() => new Set(rows.map((row) => row.id)));

  useEscapeKey(onDismiss);

  const allChecked = useMemo(
    () => rows.length > 0 && rows.every((row) => checked.has(row.id)),
    [checked, rows]
  );

  function toggle(rowId: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(rows.map((row) => row.id)));
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-[#1A1916]/30 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Apply this category to similar transactions"
      onClick={onDismiss}
    >
      <div
        className="sheet-panel flex max-h-[85vh] w-full max-w-[440px] flex-col rounded-t-[28px] border border-border bg-surface pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_24px_70px_rgba(48,38,24,0.24)] sm:rounded-[24px] sm:pb-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 pt-5">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 text-[18px] font-medium leading-tight text-text-primary">
              {rows.length} similar transaction{rows.length === 1 ? "" : "s"}
            </h3>
            {/* Same outcome as "Just this one" — the edit that opened this is
                already saved, so backing out only declines the offer. */}
            <CloseButton onClick={onDismiss} />
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13.5px] leading-snug text-text-secondary">
            Set {rows.length === 1 ? "it" : "them"} to
            <CategoryTag category={category} />
            too?
          </p>
        </div>

        <label className="mt-3 flex shrink-0 cursor-pointer items-center gap-2 border-y border-border bg-subtle px-5 py-2 text-[12.5px] font-medium text-text-secondary">
          <input
            className="h-4 w-4 cursor-pointer accent-[#C9A96E]"
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
          />
          {allChecked ? "Clear all" : "Select all"}
        </label>

        <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {rows.map((row) => {
            const isChecked = checked.has(row.id);
            return (
              <label
                key={row.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 px-5 py-2.5 transition",
                  isChecked ? "bg-accent-soft/50" : "hover:bg-subtle"
                )}
              >
                <input
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[#C9A96E]"
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(row.id)}
                />
                <span className="w-[42px] shrink-0 text-[12px] tabular-nums text-text-secondary">
                  {shortDate(row.date)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-text-primary">
                    {row.merchant || row.description || "Untitled transaction"}
                  </span>
                  {/* Normalized, so a row still holding an old Schedule C
                      heading reads as the category the app actually shows. */}
                  {normalizeCategory(row.category) ? (
                    <span className="mt-0.5 block text-[11.5px] text-text-tertiary">
                      Now: {normalizeCategory(row.category)}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[13px] font-medium tabular-nums text-text-primary">
                  {formatCurrency(row.amount)}
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 pt-3 sm:flex-row">
          <Button className="w-full" variant="soft" type="button" onClick={onDismiss}>
            Just this one
          </Button>
          <Button
            className="w-full"
            variant="accent"
            type="button"
            disabled={checked.size === 0}
            onClick={() => onApply(Array.from(checked))}
          >
            {checked.size === 0
              ? "Nothing selected"
              : `Apply to ${checked.size} more`}
          </Button>
        </div>
      </div>
    </div>
  );
}

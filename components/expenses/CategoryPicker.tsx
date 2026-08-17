"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";
import { EXPENSE_CATEGORIES, categoryTagColors } from "@/lib/categories";
import { cn } from "@/lib/cn";

/**
 * Pick a category, for one transaction or for a whole selection.
 *
 * A sheet rather than an anchored dropdown: the transaction list clips its own
 * overflow to keep its rounded corners, so a popover opened from a row near the
 * bottom would be cut in half. This always has room, and behaves the same on a
 * phone as on a laptop.
 */
export function CategoryPicker({
  title,
  current,
  onPick,
  onClose
}: {
  title: string;
  current?: string | null;
  onPick: (category: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[#1A1916]/30 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="sheet-panel w-full max-w-[400px] rounded-t-[28px] border border-border bg-surface p-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[0_24px_70px_rgba(48,38,24,0.24)] sm:rounded-[24px] sm:pb-3"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="px-1.5 pb-2 pt-1 text-[15px] font-medium text-text-primary">{title}</h3>

        <div className="space-y-0.5">
          {EXPENSE_CATEGORIES.map((category) => {
            const colors = categoryTagColors(category);
            const isCurrent = current === category;

            return (
              <button
                key={category}
                className={cn(
                  "focus-ring flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-subtle",
                  isCurrent && "bg-subtle"
                )}
                type="button"
                onClick={() => onPick(category)}
              >
                <span
                  aria-hidden
                  className="h-6 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colors.text }}
                />
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-text-primary">
                  {category}
                </span>
                {isCurrent ? (
                  <Check size={16} strokeWidth={2.2} className="shrink-0 text-accent" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

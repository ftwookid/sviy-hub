"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { CloseButton } from "@/components/ui/CloseButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SetupGroups } from "@/components/finances/SetupGroups";
import { useEscapeKey } from "@/lib/useEscapeKey";
import type { FinanceBucket, FinanceLine, PayCadence } from "@/types/finance";

/**
 * The standing figures, over the month rather than instead of it.
 *
 * This was a route for a version, and a route was wrong: Setup is opened *while*
 * looking at a month, to explain or correct the number in front of you. Navigating
 * away meant a page load and a fresh set of queries to show figures the month
 * behind it had already loaded, and closing it meant loading them all again.
 * As a panel it opens instantly on data that is already in memory, and the month
 * underneath reflects an edit the moment it is saved.
 */
export function SetupSheet({
  lines,
  onClose,
  onAddLine,
  onRename,
  onSetRate,
  onUpdateRate,
  onDeleteRate,
  onDeleteLine,
  notice
}: {
  lines: FinanceLine[];
  onClose: () => void;
  onAddLine: (input: {
    bucket: FinanceBucket;
    label: string;
    amount: number;
    cadence: PayCadence;
    effectiveFrom: string;
  }) => void;
  onRename: (lineId: string, label: string) => void;
  onSetRate: (lineId: string, effectiveFrom: string, amount: number, cadence: PayCadence) => void;
  onUpdateRate: (rateId: string, effectiveFrom: string, amount: number, cadence: PayCadence) => void;
  onDeleteRate: (rateId: string) => void;
  onDeleteLine: (lineId: string) => void;
  notice?: string;
}) {
  const [deleting, setDeleting] = useState<FinanceLine | null>(null);

  useEscapeKey(onClose, !deleting);

  return (
    <div className="fixed inset-0 z-[60] bg-[#1A1916]/20 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="slide-over-panel ml-auto flex h-full w-full max-w-[520px] flex-col overflow-y-auto bg-page p-4 shadow-[0_20px_70px_rgba(48,38,24,0.18)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Standing figures"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[23px] font-medium leading-[1.15] tracking-[-0.01em] text-text-primary sm:text-[26px]">
              Standing figures
            </h2>
            <p className="mt-1 text-[13px] text-text-secondary">
              What comes in and goes out every month, and when each amount changed.
            </p>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        {notice ? (
          <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-warning/35 bg-warning-soft px-3.5 py-3 text-[13px] text-text-primary">
            <AlertTriangle size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-warning" />
            <span>{notice}</span>
          </div>
        ) : null}

        <SetupGroups
          lines={lines}
          onAddLine={onAddLine}
          onRename={onRename}
          onSetRate={onSetRate}
          onUpdateRate={onUpdateRate}
          onDeleteRate={onDeleteRate}
          onDeleteLine={setDeleting}
        />
      </aside>

      {/* Deleting a line takes its whole history with it, which no other write
          here does — so this one asks. */}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.label}?`}
          description={
            deleting.rates.length > 1
              ? `Its ${deleting.rates.length} dated amounts go too, and every month that used them will change. To stop a line without losing its history, set it to 0 from a date instead.`
              : "It will stop counting in every month. To stop a line from a date without losing its history, set it to 0 instead."
          }
          confirmLabel="Delete it"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            onDeleteLine(deleting.id);
            setDeleting(null);
          }}
        />
      ) : null}
    </div>
  );
}

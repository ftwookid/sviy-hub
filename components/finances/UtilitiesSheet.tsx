"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { CloseButton } from "@/components/ui/CloseButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { UtilityGroups } from "@/components/finances/UtilityGroups";
import { useEscapeKey } from "@/lib/useEscapeKey";
import type { UtilityAccountBills, UtilityBook, UtilityBucket } from "@/types/utility";

/**
 * The metered bills, over the month rather than instead of it.
 *
 * Same reasoning as the Setup panel, and the same shape. This is opened *while*
 * looking at a month — to enter the water bill that just arrived, or to find out
 * whether the figure in the Needs block has been climbing — so a route would
 * mean a page load and a fresh set of queries to show data the month behind it
 * already holds, then another load coming back. As a panel it opens instantly,
 * and a bill saved here lands on the month underneath while it is still open.
 *
 * A centred dialog on a desktop, the whole screen on a phone. The header stays
 * put and the bills scroll under it.
 */
export function UtilitiesSheet({
  book,
  periodMonth,
  notice,
  onClose,
  onAddAccount,
  onRename,
  onSetBucket,
  onDeleteAccount,
  onSetBill,
  onDeleteBill
}: {
  book: UtilityBook;
  periodMonth: string;
  notice?: string;
  onClose: () => void;
  onAddAccount: (input: { name: string; bucket: UtilityBucket }) => void;
  onRename: (accountId: string, name: string) => void;
  onSetBucket: (accountId: string, bucket: UtilityBucket) => void;
  onDeleteAccount: (accountId: string) => void;
  onSetBill: (accountId: string, billPeriodMonth: string, amount: number) => void;
  onDeleteBill: (billId: string) => void;
}) {
  const [deleting, setDeleting] = useState<UtilityAccountBills | null>(null);

  useEscapeKey(onClose, !deleting);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-[#1A1916]/30 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <aside
        className="sheet-panel flex h-full w-full flex-col overflow-hidden bg-page shadow-[0_24px_80px_rgba(48,38,24,0.22)] sm:h-auto sm:max-h-[88vh] sm:max-w-[880px] sm:rounded-[24px] sm:border sm:border-border"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Utilities"
      >
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-5">
          <h2 className="min-w-0 text-[23px] font-medium leading-[1.15] tracking-[-0.01em] text-text-primary sm:text-[26px]">
            Utilities
          </h2>
          <CloseButton onClick={onClose} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(16px+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          {notice ? (
            <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-warning/35 bg-warning-soft px-3.5 py-3 text-[13px] text-text-primary">
              <AlertTriangle size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-warning" />
              <span>{notice}</span>
            </div>
          ) : null}

          <UtilityGroups
            book={book}
            periodMonth={periodMonth}
            onAddAccount={onAddAccount}
            onRename={onRename}
            onSetBucket={onSetBucket}
            onDeleteAccount={setDeleting}
            onSetBill={onSetBill}
            onDeleteBill={onDeleteBill}
          />
        </div>
      </aside>

      {/* Deleting an account takes every bill ever entered against it, which is
          the history the whole section exists for — so this one asks. */}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.account.name}?`}
          description={
            deleting.bills.length > 0
              ? `Its ${deleting.bills.length} ${deleting.bills.length === 1 ? "bill goes" : "bills go"} too, and the months they were in change.`
              : "Nothing has been billed against it yet."
          }
          confirmLabel="Delete it"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            onDeleteAccount(deleting.account.id);
            setDeleting(null);
          }}
        />
      ) : null}
    </div>
  );
}

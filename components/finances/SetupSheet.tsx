"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { CloseButton } from "@/components/ui/CloseButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { HomesSection } from "@/components/finances/HomesSection";
import { SetupGroups } from "@/components/finances/SetupGroups";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useScrollLock } from "@/lib/useScrollLock";
import type { FinanceBucket, FinanceHome, FinanceLine, PayCadence } from "@/types/finance";

/**
 * The standing figures, over the month rather than instead of it.
 *
 * This was a route for a version, and a route was wrong: Setup is opened *while*
 * looking at a month, to explain or correct the number in front of you. Navigating
 * away meant a page load and a fresh set of queries to show figures the month
 * behind it had already loaded, and closing it meant loading them all again.
 * As a panel it opens instantly on data that is already in memory, and the month
 * underneath reflects an edit the moment it is saved.
 *
 * **A centred dialog on a desktop, not a 520px rail.** It was a slide-over, and
 * a slide-over sets its width from the edge of the screen rather than from what
 * is inside it — so a date, a cadence and an amount were fighting over 470px of
 * usable room while 900px of page sat dimmed behind them. Nothing here wants to
 * be beside the month: the month is not readable while this is open. So it is
 * 880px in the middle of the screen with the row of fields laid out across it,
 * and on a phone, where there is no middle, it is the whole screen.
 *
 * The header stays put and the figures scroll under it — the list is longer than
 * a viewport once a bucket has a few lines, and scrolling the title away leaves
 * no way back out but the Escape key.
 */
export function SetupSheet({
  lines,
  homes,
  onClose,
  onAddLine,
  onRename,
  onSetRate,
  onUpdateRate,
  onDeleteRate,
  onDeleteLine,
  onAddHome,
  onUpdateHome,
  onDeleteHome,
  notice
}: {
  lines: FinanceLine[];
  /** Addresses, for the block at the foot of the panel. */
  homes: FinanceHome[];
  onClose: () => void;
  onAddLine: (input: {
    bucket: FinanceBucket;
    label: string;
    amount: number;
    cadence: PayCadence;
    effectiveFrom: string;
    effectiveTo: string | null;
  }) => void;
  onRename: (lineId: string, label: string) => void;
  onSetRate: (
    lineId: string,
    effectiveFrom: string,
    amount: number,
    cadence: PayCadence,
    effectiveTo: string | null
  ) => void;
  onUpdateRate: (
    rateId: string,
    effectiveFrom: string,
    amount: number,
    cadence: PayCadence,
    effectiveTo: string | null
  ) => void;
  onDeleteRate: (rateId: string) => void;
  onDeleteLine: (lineId: string) => void;
  onAddHome: (input: { name: string; movedIn: string }) => void;
  onUpdateHome: (input: { id: string; name: string; movedIn: string }) => void;
  onDeleteHome: (homeId: string) => void;
  notice?: string;
}) {
  const [deleting, setDeleting] = useState<FinanceLine | null>(null);
  const [deletingHome, setDeletingHome] = useState<FinanceHome | null>(null);

  useEscapeKey(onClose, !deleting && !deletingHome);
  useScrollLock();

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
        aria-label="Standing figures"
      >
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-5">
          {/* The title and nothing under it. A subtitle explaining that money
              comes in and goes out tells whoever typed these figures nothing,
              and cost a line at the top of every visit. */}
          <h2 className="min-w-0 text-figure-lg font-semibold leading-[1.15] tracking-[-0.01em] text-text-primary sm:text-display-sm">
            Standing figures
          </h2>
          <CloseButton onClick={onClose} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(16px+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          {notice ? (
            <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-warning/35 bg-warning-soft px-3.5 py-3 text-list text-text-primary">
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

          {/* Last in the panel, because it is read least: an address is typed
              twice in a decade. It is here rather than beside the chart that
              uses it for the same reason the car's numbers live in Profile —
              a form next to a reading charges every visit for a field almost
              nobody touches. */}
          <HomesSection
            homes={homes}
            onAdd={onAddHome}
            onUpdate={onUpdateHome}
            onDelete={setDeletingHome}
          />
        </div>
      </aside>

      {/* Deleting a line takes its whole history with it, which no other write
          here does — so this one asks. */}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.label}?`}
          description={
            deleting.rates.length > 1
              ? `Its ${deleting.rates.length} dated amounts go too. To stop it instead, give it an end date.`
              : "To stop it instead, give it an end date."
          }
          confirmLabel="Delete it"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            onDeleteLine(deleting.id);
            setDeleting(null);
          }}
        />
      ) : null}

      {/* A home is two fields, but deleting one silently un-groups years of
          bills on every chart that was reading by it — so it names what stops
          working rather than what is stored. */}
      {deletingHome ? (
        <ConfirmDialog
          title={`Delete ${deletingHome.name}?`}
          description="The bills stay. They stop being grouped under this address, so the By home comparison loses that side of it."
          confirmLabel="Delete it"
          onCancel={() => setDeletingHome(null)}
          onConfirm={() => {
            onDeleteHome(deletingHome.id);
            setDeletingHome(null);
          }}
        />
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { SetupGroups } from "@/components/finances/SetupGroups";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import {
  addFinanceLine,
  deleteFinanceLine,
  deleteFinanceRate,
  loadFinanceLines,
  renameFinanceLine,
  setFinanceRate
} from "@/lib/financeClient";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { FinanceLine } from "@/types/finance";

/**
 * Setup — the standing figures, and when each of them changed.
 *
 * A stage rather than a tab: reached from the Setup control on the month, and
 * left by the back arrow. It is opened a few times a year, so it costs nothing
 * on the visits that do not want it.
 *
 * Every write here is dated, so entering this year's raise cannot restate last
 * year: the months before the date keep the amount they had.
 */
export default function FinancesSetupPage() {
  const { user, authLoading } = useAuthUser();
  const [lines, setLines] = useState<FinanceLine[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [deleting, setDeleting] = useState<FinanceLine | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  const refresh = useCallback(async () => {
    try {
      const { lines: nextLines, setupNeeded, setupMessage } = await loadFinanceLines();
      setLines(nextLines);
      setNotice(setupNeeded ? setupMessage : "");
    } catch (error) {
      setLines([]);
      setNotice(error instanceof Error ? error.message : "Could not load your figures");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    refresh().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refresh, user]);

  async function run(action: () => Promise<void>, message: string) {
    try {
      await action();
      await refresh();
      showToast(message);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save that");
    }
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      {/* Same 44px slot the section title occupies elsewhere, so stepping in here
          does not nudge the content below it. */}
      <div className="mb-4 flex min-h-11 items-center gap-1">
        <Link
          href="/finances"
          aria-label="Back to the month"
          className="focus-ring -ml-2 rounded-xl p-2 text-text-secondary transition-colors duration-200 ease-out hover:bg-subtle hover:text-text-primary"
        >
          <ChevronLeft size={20} strokeWidth={1.8} />
        </Link>
        <h1 className="text-[17px] font-medium leading-tight tracking-[-0.01em] text-text-primary">
          Standing figures
        </h1>
      </div>

      <div className="space-y-3">
        {notice ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-warning/35 bg-warning-soft px-3.5 py-3 text-[13px] text-text-primary">
            <AlertTriangle size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-warning" />
            <span>{notice}</span>
          </div>
        ) : null}

        {loading ? (
          <SkeletonRows />
        ) : (
          <SetupGroups
            lines={lines}
            onAddLine={(input) =>
              run(
                () =>
                  addFinanceLine({
                    userId: user.id,
                    bucket: input.bucket,
                    label: input.label,
                    amount: input.amount,
                    effectiveFrom: input.effectiveFrom,
                    existingCount: lines.filter((line) => line.bucket === input.bucket).length
                  }),
                `${input.label} added`
              )
            }
            onRename={(lineId, label) => run(() => renameFinanceLine(lineId, label), "Renamed")}
            onSetRate={(lineId, effectiveFrom, amount) =>
              run(() => setFinanceRate({ userId: user.id, lineId, effectiveFrom, amount }), "Change saved")
            }
            onDeleteRate={(rateId) => run(() => deleteFinanceRate(rateId), "Change removed")}
            onDeleteLine={setDeleting}
          />
        )}
      </div>

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
          busy={deleteBusy}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            setDeleteBusy(true);
            await run(() => deleteFinanceLine(deleting.id), `${deleting.label} deleted`);
            setDeleteBusy(false);
            setDeleting(null);
          }}
        />
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { FinanceTabs } from "@/components/finances/FinanceTabs";
import { SetupBucketCard } from "@/components/finances/SetupBucketCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { BUCKET_BLURBS, EDITABLE_BUCKETS } from "@/lib/finances";
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
import type { FinanceBucket, FinanceLine } from "@/types/finance";

/**
 * Setup — the standing figures, and when each of them changed.
 *
 * The month view is for reading; this is the only place a typed figure is
 * written. Every write here is dated, so entering this year's raise cannot
 * restate last year: the months before the date keep the amount they had.
 */

const TITLES: Record<FinanceBucket, string> = {
  "Gross Income": "Gross income",
  "Tax Withheld": "Tax withheld",
  Needs: "Needs",
  Debt: "Debt",
  "Investments & Savings": "Investments & savings"
};

export default function FinancesSetupPage() {
  const { user, authLoading } = useAuthUser();
  const [lines, setLines] = useState<FinanceLine[]>([]);
  const [setupMessage, setSetupMessage] = useState("");
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
      const { lines: nextLines, setupNeeded, setupMessage: message } = await loadFinanceLines();
      setLines(nextLines);
      setSetupMessage(setupNeeded ? message : "");
    } catch (error) {
      setLines([]);
      setSetupMessage(error instanceof Error ? error.message : "Could not load your figures");
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
      <PageHeader title="Finances" />
      <div className="space-y-3">
        <FinanceTabs />

        {setupMessage ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-warning/35 bg-warning-soft px-3.5 py-3 text-[13px] text-text-primary">
            <AlertTriangle size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-warning" />
            <span>{setupMessage}</span>
          </div>
        ) : null}

        {loading ? (
          <SkeletonRows />
        ) : (
          EDITABLE_BUCKETS.map((bucket) => (
            <SetupBucketCard
              key={bucket}
              bucket={bucket}
              title={TITLES[bucket]}
              blurb={BUCKET_BLURBS[bucket]}
              lines={lines.filter((line) => line.bucket === bucket)}
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
          ))
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

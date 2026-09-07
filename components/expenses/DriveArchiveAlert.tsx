"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, HardDrive, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDriveConnection } from "@/lib/useDriveConnection";

/**
 * The archive is plumbing, not something to look at every day.
 *
 * The full connect/folder/disconnect controls live in Profile. All that belongs
 * on the transactions page is a nudge when receipts are actually stuck — and it
 * offers to fix itself rather than sending the user off to do it by hand.
 */
export function DriveArchiveAlert({
  pendingCount,
  onSynced
}: {
  pendingCount: number;
  onSynced?: () => void;
}) {
  const { connection, configured, loading, busy, error, syncNow } = useDriveConnection();
  const [note, setNote] = useState("");
  const [dismissed, setDismissed] = useState(false);

  const ready = connection.connected && Boolean(connection.rootFolderId);
  const failing = Boolean(error || connection.lastSyncError);
  const stuck = ready && pendingCount > 0;
  const needsSetup = configured && !ready;

  // Nothing to say while it is working, or when it is quietly doing its job.
  if (loading || !configured || dismissed) return null;
  if (!stuck && !failing && !needsSetup) return null;

  async function handleFix() {
    setNote("");
    const result = await syncNow();
    if (result.failed > 0) {
      setNote(`${result.synced} archived, ${result.failed} could not be.`);
      return;
    }
    setDismissed(true);
    onSynced?.();
  }

  // Not connected, or connected with no folder chosen — the fix is a decision
  // only the user can make, so point at where it is made.
  if (needsSetup && !failing) {
    return (
      <Link
        href="/profile"
        className="focus-ring flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 text-list text-text-secondary transition hover:bg-subtle"
      >
        <HardDrive size={15} strokeWidth={1.8} className="shrink-0 text-text-tertiary" />
        <span className="min-w-0 flex-1">Receipt archive is off. Receipts stay in the app only.</span>
        <span className="shrink-0 font-medium text-text-primary">Set up</span>
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border px-3 py-2 text-list",
        failing ? "border-danger/25 bg-danger-soft text-danger" : "border-warning/30 bg-warning-soft text-text-secondary"
      )}
    >
      {failing ? (
        <AlertCircle size={15} strokeWidth={1.8} className="shrink-0" />
      ) : (
        <HardDrive size={15} strokeWidth={1.8} className="shrink-0 text-warning" />
      )}
      <span className="min-w-0 flex-1">
        {note ||
          (failing
            ? error || connection.lastSyncError
            : `${pendingCount} receipt${pendingCount === 1 ? "" : "s"} waiting to archive.`)}
      </span>
      <button
        className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1 font-medium text-text-primary transition hover:bg-subtle disabled:opacity-60"
        type="button"
        disabled={busy || !ready}
        onClick={handleFix}
      >
        <RefreshCw size={13} strokeWidth={2} className={cn(busy && "animate-spin")} />
        {busy ? "Fixing" : "Fix it"}
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { AlertCircle, Check, FolderOpen, HardDrive, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useDriveConnection } from "@/lib/useDriveConnection";

function relativeTime(value: string | null) {
  if (!value) return "never";
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function DriveArchiveCard({ pendingCount }: { pendingCount: number }) {
  const { connection, configured, loading, busy, error, connect, chooseFolder, syncNow, disconnect } =
    useDriveConnection();
  const [syncNote, setSyncNote] = useState("");

  if (loading) {
    return <div className="h-[120px] animate-pulse rounded-[20px] border border-border bg-subtle" />;
  }

  if (!configured) {
    return (
      <section className="rounded-[20px] border border-warning/30 bg-warning-soft p-4">
        <h3 className="text-[15px] font-medium text-text-primary">Drive archive not configured</h3>
        <p className="mt-1 text-[13px] text-text-secondary">
          Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, then redeploy.
        </p>
      </section>
    );
  }

  const readyToSync = connection.connected && Boolean(connection.rootFolderId);

  async function handleSync() {
    setSyncNote("");
    const result = await syncNow();
    if (result.failed > 0) {
      setSyncNote(`${result.synced} archived, ${result.failed} failed.`);
    } else if (result.synced > 0) {
      setSyncNote(`${result.synced} receipt${result.synced === 1 ? "" : "s"} archived to Drive.`);
    } else {
      setSyncNote("Everything is already archived.");
    }
  }

  return (
    <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-[14px]",
              readyToSync ? "bg-success-soft text-success" : "bg-accent-soft text-accent"
            )}
          >
            <HardDrive size={18} strokeWidth={1.6} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-medium text-text-primary">Google Drive archive</h3>
            {connection.connected ? (
              <p className="mt-0.5 truncate text-[13px] text-text-secondary">
                {connection.rootFolderName ? (
                  <>
                    Filing into <span className="font-medium">{connection.rootFolderName}</span>
                    {connection.googleEmail ? ` · ${connection.googleEmail}` : null}
                  </>
                ) : (
                  "Connected. Choose the folder to file into."
                )}
              </p>
            ) : (
              <p className="mt-0.5 text-[13px] text-text-secondary">
                Connect so every receipt is archived by year and month.
              </p>
            )}
          </div>
        </div>

        {readyToSync && pendingCount === 0 ? (
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-medium text-success sm:inline-flex">
            <Check size={13} strokeWidth={2} />
            Synced
          </span>
        ) : null}
      </div>

      {connection.connected && pendingCount > 0 ? (
        <p className="mt-3 rounded-xl bg-subtle px-3 py-2 text-[13px] text-text-secondary">
          {pendingCount} receipt{pendingCount === 1 ? "" : "s"} waiting to archive
          {connection.lastSyncAt ? ` · last sync ${relativeTime(connection.lastSyncAt)}` : null}
        </p>
      ) : null}

      {error || connection.lastSyncError ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">
          <AlertCircle size={15} strokeWidth={1.8} className="mt-0.5 shrink-0" />
          <span>{error || connection.lastSyncError}</span>
        </p>
      ) : null}

      {syncNote ? <p className="mt-3 text-[13px] text-text-secondary">{syncNote}</p> : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {!connection.connected ? (
          <Button className="w-full sm:w-auto" variant="accent" disabled={busy} onClick={connect}>
            Connect Google Drive
          </Button>
        ) : (
          <>
            <Button className="w-full sm:w-auto" variant="soft" disabled={busy} onClick={chooseFolder}>
              <FolderOpen size={16} strokeWidth={1.7} />
              {connection.rootFolderId ? "Change folder" : "Choose folder"}
            </Button>
            <Button
              className="w-full sm:w-auto"
              variant={pendingCount > 0 ? "accent" : "soft"}
              disabled={busy || !readyToSync}
              onClick={handleSync}
            >
              <RefreshCw size={16} strokeWidth={1.7} className={cn(busy && "animate-spin")} />
              {busy ? "Syncing..." : "Sync now"}
            </Button>
            <Button
              className="w-full sm:ml-auto sm:w-auto"
              variant="ghost"
              disabled={busy}
              onClick={disconnect}
            >
              Disconnect
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

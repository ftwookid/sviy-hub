"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { openDriveFolderPicker } from "@/lib/googlePicker";
import type { DriveConnection } from "@/types/expense";

const DISCONNECTED: DriveConnection = {
  connected: false,
  googleEmail: null,
  rootFolderId: null,
  rootFolderName: null,
  lastSyncAt: null,
  lastSyncError: null
};

type SyncResult = { synced: number; failed: number; hasMore: boolean; errors: string[] };

export function useDriveConnection() {
  const [connection, setConnection] = useState<DriveConnection>(DISCONNECTED);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const body = await authedFetch<{ configured: boolean; connection: DriveConnection }>(
        "/api/google/status"
      );
      setConfigured(body.configured);
      setConnection(body.connection);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not check Google Drive.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connect = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const { url } = await authedFetch<{ url: string }>("/api/google/connect", { method: "POST" });
      window.location.href = url;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start Google sign-in.");
      setBusy(false);
    }
  }, []);

  const chooseFolder = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const credentials = await authedFetch<{
        accessToken: string;
        developerKey: string | null;
        appId: string | null;
      }>("/api/google/picker-token");

      const picked = await openDriveFolderPicker(
        credentials.accessToken,
        credentials.developerKey,
        credentials.appId
      );
      if (!picked) return;

      await authedFetch("/api/google/folder", {
        method: "POST",
        body: JSON.stringify({ folderId: picked.id })
      });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that folder.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  /** Drains the sync queue, looping while the server reports more work. */
  const syncNow = useCallback(async () => {
    setBusy(true);
    setError("");
    let synced = 0;
    let failed = 0;

    try {
      for (let pass = 0; pass < 25; pass += 1) {
        const result = await authedFetch<SyncResult>("/api/receipts/sync", { method: "POST" });
        synced += result.synced;
        failed += result.failed;
        if (!result.hasMore) break;
        // A pass that moved nothing means every remaining receipt is failing.
        if (result.synced === 0) break;
      }
      await refresh();
      return { synced, failed };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Drive sync failed.");
      return { synced, failed };
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await authedFetch("/api/google/disconnect", { method: "POST" });
      setConnection(DISCONNECTED);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not disconnect.");
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    connection,
    configured,
    loading,
    busy,
    error,
    refresh,
    connect,
    chooseFolder,
    syncNow,
    disconnect
  };
}

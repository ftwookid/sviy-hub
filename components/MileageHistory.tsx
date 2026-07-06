"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, History, MoreHorizontal, RotateCcw, UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import type { MileageUpload } from "@/types/mileage";

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function timestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function signedMiles(value: number) {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(1)} mi`;
}

function signedCurrency(value: number) {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

export function MileageHistory({
  uploads,
  restoringId,
  changingOwnerId,
  ownerLabels = {},
  ownerOptions = [],
  canChangeOwner = false,
  onRestore,
  onChangeOwner
}: {
  uploads: MileageUpload[];
  restoringId: string;
  changingOwnerId?: string;
  ownerLabels?: Record<string, string>;
  ownerOptions?: Array<{ id: string; label: string }>;
  canChangeOwner?: boolean;
  onRestore: (upload: MileageUpload) => void;
  onChangeOwner?: (upload: MileageUpload, ownerId: string) => void;
}) {
  const [openMenu, setOpenMenu] = useState("");
  const [expandedMonth, setExpandedMonth] = useState("");
  const [ownerMenuUploadId, setOwnerMenuUploadId] = useState("");
  const actionMenuRef = useRef<HTMLDivElement>(null);

  const monthGroups = useMemo(() => {
    const groups = new Map<string, MileageUpload[]>();
    uploads.forEach((upload) => {
      const key = `${upload.user_id}:${upload.period_month}`;
      groups.set(key, [...(groups.get(key) ?? []), upload]);
    });
    const grouped = Array.from(groups.entries()).map(([key, versions]) => ({
      key,
      userId: versions[0]?.user_id ?? "",
      periodMonth: versions[0]?.period_month ?? "",
      versions,
      current: versions.find((version) => version.is_active) ?? versions[0],
      deltaMiles: 0,
      deltaDeduction: 0,
      ytdMiles: 0,
      ytdDeduction: 0,
      hasPrevious: false
    }));

    const byYear = new Map<string, typeof grouped>();
    grouped.forEach((group) => {
      const yearOwnerKey = `${group.userId}:${group.periodMonth.slice(0, 4)}`;
      byYear.set(yearOwnerKey, [...(byYear.get(yearOwnerKey) ?? []), group]);
    });

    byYear.forEach((yearGroups) => {
      let previousMiles = 0;
      let previousDeduction = 0;
      let ytdMiles = 0;
      let ytdDeduction = 0;

      yearGroups
        .slice()
        .sort((a, b) => a.periodMonth.localeCompare(b.periodMonth))
        .forEach((group, index) => {
          const monthMiles = Number(group.current.business_miles);
          const monthDeduction = Number(group.current.deduction_value);
          group.hasPrevious = index > 0;
          group.deltaMiles = monthMiles - previousMiles;
          group.deltaDeduction = monthDeduction - previousDeduction;
          ytdMiles += monthMiles;
          ytdDeduction += monthDeduction;
          group.ytdMiles = ytdMiles;
          group.ytdDeduction = ytdDeduction;
          previousMiles = monthMiles;
          previousDeduction = monthDeduction;
        });
    });

    return grouped.sort((a, b) => b.periodMonth.localeCompare(a.periodMonth) || a.userId.localeCompare(b.userId));
  }, [uploads]);

  function download(upload: MileageUpload) {
    const blob = new Blob([upload.raw_csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = upload.original_filename;
    link.click();
    URL.revokeObjectURL(url);
    setOpenMenu("");
  }

  useEffect(() => {
    if (!openMenu) return;

    function handlePointerDown(event: MouseEvent) {
      if (!actionMenuRef.current?.contains(event.target as Node)) {
        setOpenMenu("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openMenu]);

  if (!uploads.length) return null;

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-medium text-text-primary">Imported months</h2>
          <p className="mt-1 text-[12px] text-text-tertiary">Manage confirmed data, source files, and prior versions.</p>
        </div>
        <span className="text-[12px] text-text-tertiary">{monthGroups.length} months</span>
      </div>

      <div className="space-y-3">
        {monthGroups.map(
          ({ key, userId, periodMonth, versions, current, deltaMiles, deltaDeduction, ytdMiles, ytdDeduction, hasPrevious }) => {
          const expanded = expandedMonth === key;
          const ownerLabel = ownerLabels[userId] ?? `User ${userId.slice(0, 8)}`;
          return (
            <article key={key} className="relative rounded-[22px] border border-border bg-surface shadow-card">
              <div className="grid gap-4 p-4 sm:grid-cols-[1.25fr_.55fr_.7fr_.8fr_1fr_1.1fr_auto] sm:items-center sm:p-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[16px] font-medium text-text-primary">{monthLabel(periodMonth)}</h3>
                    {canChangeOwner ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                        <UserRound size={12} strokeWidth={1.7} />
                        {ownerLabel}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
                        current.is_complete ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
                      )}
                    >
                      {current.is_complete ? "Complete" : "Partial"}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
                        current.is_active ? "bg-accent-soft text-text-primary" : "bg-subtle text-text-tertiary"
                      )}
                    >
                      {current.is_active ? "Confirmed" : "Pending"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-text-tertiary">
                    Imported {timestamp(current.uploaded_at)}
                    {versions.length > 1 ? ` · ${versions.length} versions` : ""}
                  </p>
                </div>

                <div>
                  <div className="text-[11px] font-medium text-text-tertiary">Trips</div>
                  <div className="mt-1 text-[14px] font-medium text-text-primary">{current.business_trip_count}</div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-text-tertiary">Miles</div>
                  <div className="mt-1 text-[14px] font-medium text-text-primary">
                    {Number(current.business_miles).toFixed(1)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-text-tertiary">Deduction</div>
                  <div className="mt-1 text-[14px] font-medium text-success">{formatCurrency(current.deduction_value)}</div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-text-tertiary">Vs previous</div>
                  {hasPrevious ? (
                    <>
                      <div className="mt-1 text-[12px] font-medium text-text-primary">{signedMiles(deltaMiles)}</div>
                      <div className="mt-0.5 text-[11px] text-text-tertiary">{signedCurrency(deltaDeduction)}</div>
                    </>
                  ) : (
                    <div className="mt-1 text-[12px] text-text-tertiary">Starting month</div>
                  )}
                </div>
                <div className="rounded-xl bg-subtle px-3 py-2">
                  <div className="text-[11px] font-medium text-text-tertiary">{periodMonth.slice(0, 4)} YTD</div>
                  <div className="mt-1 text-[12px] font-medium text-text-primary">
                    {ytdMiles.toFixed(1)} mi
                  </div>
                  <div className="mt-0.5 text-[11px] text-success">{formatCurrency(ytdDeduction)}</div>
                </div>

                <div
                  ref={openMenu === key ? actionMenuRef : undefined}
                  className="absolute right-3 top-3 sm:static sm:relative"
                >
                  <button
                    className="focus-ring grid h-9 w-9 place-items-center rounded-md text-text-tertiary transition hover:bg-subtle hover:text-text-secondary"
                    onClick={() => setOpenMenu((value) => (value === key ? "" : key))}
                    aria-label={`Actions for ${monthLabel(periodMonth)}`}
                    type="button"
                  >
                    <MoreHorizontal size={18} strokeWidth={1.5} />
                  </button>
                  {openMenu === key ? (
                    <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-56 rounded-lg border border-border bg-surface p-1 shadow-card">
                      <button
                        type="button"
                        className="flex min-h-9 w-full items-center gap-2 rounded-md px-3 text-left text-[12px] text-text-secondary transition hover:bg-subtle hover:text-text-primary"
                        onClick={() => {
                          setExpandedMonth(expanded ? "" : key);
                          setOpenMenu("");
                        }}
                      >
                        <History size={15} />
                        View version history
                      </button>
                      <button
                        type="button"
                        className="flex min-h-9 w-full items-center gap-2 rounded-md px-3 text-left text-[12px] text-text-secondary transition hover:bg-subtle hover:text-text-primary"
                        onClick={() => download(current)}
                      >
                        <Download size={15} />
                        Download original CSV
                      </button>
                      {versions.some((version) => !version.is_active) ? (
                        <button
                          type="button"
                          className="flex min-h-9 w-full items-center gap-2 rounded-md px-3 text-left text-[12px] text-text-secondary transition hover:bg-subtle hover:text-text-primary"
                          onClick={() => {
                            setExpandedMonth(key);
                            setOpenMenu("");
                          }}
                        >
                          <RotateCcw size={15} />
                          Restore previous version
                        </button>
                      ) : null}
                      {canChangeOwner ? (
                        <button
                          type="button"
                          className="flex min-h-9 w-full items-center gap-2 rounded-md px-3 text-left text-[12px] text-text-secondary transition hover:bg-subtle hover:text-text-primary"
                          onClick={() => {
                            setOwnerMenuUploadId(current.id);
                            setExpandedMonth(key);
                            setOpenMenu("");
                          }}
                        >
                          <UserRound size={15} />
                          Change owner
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              {expanded ? (
                <div className="border-t border-border bg-[#FBF9F5] px-4 py-4 sm:px-5">
                  <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
                    <History size={14} />
                    Version history
                  </div>
                  <div className="space-y-2">
                    {versions.map((version) => (
                      <div
                        key={version.id}
                        className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-[12px] font-medium text-text-primary">
                            {timestamp(version.uploaded_at)}
                            {version.is_active ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-success">
                                <Check size={12} />
                                Active
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-text-tertiary">
                            {version.original_filename} · {version.business_trip_count} trips ·{" "}
                            {Number(version.business_miles).toFixed(1)} mi · {formatCurrency(version.deduction_value)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button className="min-h-9 px-3 text-[12px]" variant="ghost" onClick={() => download(version)}>
                            <Download size={14} />
                            CSV
                          </Button>
                          {!version.is_active ? (
                            <Button
                              className="min-h-9 px-3 text-[12px]"
                              variant="soft"
                              disabled={restoringId === version.id}
                              onClick={() => onRestore(version)}
                            >
                              <RotateCcw size={14} />
                              {restoringId === version.id ? "Restoring…" : "Restore"}
                            </Button>
                          ) : null}
                          {canChangeOwner ? (
                            <Button
                              className="min-h-9 px-3 text-[12px]"
                              variant="ghost"
                              disabled={changingOwnerId === version.id}
                              onClick={() => setOwnerMenuUploadId((current) => (current === version.id ? "" : version.id))}
                            >
                              <UserRound size={14} />
                              Owner
                            </Button>
                          ) : null}
                        </div>
                        {canChangeOwner && ownerMenuUploadId === version.id ? (
                          <div className="sm:col-span-2 mt-1 rounded-2xl border border-border bg-[#FBF9F5] p-2">
                            <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
                              Move to owner
                            </div>
                            <div className="grid gap-1 sm:grid-cols-2">
                              {ownerOptions.map((owner) => (
                                <button
                                  key={owner.id}
                                  className={cn(
                                    "focus-ring min-h-9 rounded-xl px-3 text-left text-[13px] font-medium transition",
                                    owner.id === version.user_id
                                      ? "bg-accent-soft text-text-primary"
                                      : "text-text-secondary hover:bg-surface"
                                  )}
                                  type="button"
                                  disabled={owner.id === version.user_id || changingOwnerId === version.id}
                                  onClick={() => {
                                    setOwnerMenuUploadId("");
                                    onChangeOwner?.(version, owner.id);
                                  }}
                                >
                                  {owner.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

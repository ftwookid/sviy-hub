"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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

function StatusPill({
  children,
  tone
}: {
  children: ReactNode;
  tone: "success" | "accent" | "muted" | "warning";
}) {
  const tones = {
    success: "bg-success-soft text-success",
    accent: "bg-accent-soft text-text-primary",
    muted: "bg-subtle text-text-tertiary",
    warning: "bg-warning-soft text-warning"
  };

  return (
    <span className={cn("inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

function MileageMetric({
  label,
  value,
  detail,
  tone = "default"
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "success";
}) {
  return (
    <div className="flex min-h-[58px] min-w-0 flex-col justify-center">
      <div className="text-[11px] font-medium text-text-tertiary">{label}</div>
      <div className={cn("mt-1 text-[14px] font-medium leading-tight text-text-primary", tone === "success" && "text-success")}>
        {value}
      </div>
      {detail ? <div className="mt-0.5 text-[11px] leading-tight text-text-tertiary">{detail}</div> : null}
    </div>
  );
}

function MileageYtdCard({ year, miles, deduction }: { year: string; miles: number; deduction: number }) {
  return (
    <div className="flex min-h-[76px] min-w-[150px] flex-col justify-center rounded-xl bg-subtle px-3 py-2">
      <div className="text-[11px] font-medium text-text-tertiary">{year} YTD</div>
      <div className="mt-2 text-[12px] font-medium leading-tight text-text-primary">{miles.toFixed(1)} mi</div>
      <div className="mt-1 text-[11px] leading-tight text-success">{formatCurrency(deduction)}</div>
    </div>
  );
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
              <div className="grid min-h-[120px] gap-4 p-4 pr-14 sm:grid-cols-[minmax(170px,1.35fr)_70px_90px_110px_120px_150px_36px] sm:items-center sm:p-5">
                <div className="flex min-h-[82px] min-w-0 flex-col justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="min-w-0 truncate text-[16px] font-medium text-text-primary">{monthLabel(periodMonth)}</h3>
                    {canChangeOwner ? (
                      <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-subtle px-2.5 text-[11px] font-medium text-text-secondary">
                        <UserRound size={12} strokeWidth={1.7} />
                        <span className="max-w-[116px] truncate">{ownerLabel}</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-h-7 flex-wrap items-center gap-2">
                    <StatusPill tone={current.is_complete ? "success" : "warning"}>
                      {current.is_complete ? "Complete" : "Partial"}
                    </StatusPill>
                    <StatusPill tone={current.is_active ? "accent" : "muted"}>
                      {current.is_active ? "Confirmed" : "Pending"}
                    </StatusPill>
                  </div>
                  <p className="truncate text-[11px] text-text-tertiary">
                    Imported {timestamp(current.uploaded_at)}
                    {versions.length > 1 ? ` · ${versions.length} versions` : ""}
                  </p>
                </div>

                <MileageMetric label="Trips" value={String(current.business_trip_count)} />
                <MileageMetric label="Miles" value={Number(current.business_miles).toFixed(1)} />
                <MileageMetric label="Deduction" value={formatCurrency(current.deduction_value)} tone="success" />
                <MileageMetric
                  label="Vs previous"
                  value={hasPrevious ? signedMiles(deltaMiles) : "Starting month"}
                  detail={hasPrevious ? signedCurrency(deltaDeduction) : undefined}
                />
                <MileageYtdCard year={periodMonth.slice(0, 4)} miles={ytdMiles} deduction={ytdDeduction} />

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

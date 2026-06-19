"use client";

import { useMemo, useState } from "react";
import { Check, Download, History, MoreHorizontal, RotateCcw } from "lucide-react";
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
  onRestore
}: {
  uploads: MileageUpload[];
  restoringId: string;
  onRestore: (upload: MileageUpload) => void;
}) {
  const [openMenu, setOpenMenu] = useState("");
  const [expandedMonth, setExpandedMonth] = useState("");

  const monthGroups = useMemo(() => {
    const groups = new Map<string, MileageUpload[]>();
    uploads.forEach((upload) => {
      groups.set(upload.period_month, [...(groups.get(upload.period_month) ?? []), upload]);
    });
    const grouped = Array.from(groups.entries()).map(([periodMonth, versions]) => ({
      periodMonth,
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
      const year = group.periodMonth.slice(0, 4);
      byYear.set(year, [...(byYear.get(year) ?? []), group]);
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

    return grouped.sort((a, b) => b.periodMonth.localeCompare(a.periodMonth));
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
          ({ periodMonth, versions, current, deltaMiles, deltaDeduction, ytdMiles, ytdDeduction, hasPrevious }) => {
          const expanded = expandedMonth === periodMonth;
          return (
            <article key={periodMonth} className="relative rounded-[22px] border border-border bg-surface shadow-card">
              <div className="grid gap-4 p-4 sm:grid-cols-[1.25fr_.55fr_.7fr_.8fr_1fr_1.1fr_auto] sm:items-center sm:p-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[16px] font-medium text-text-primary">{monthLabel(periodMonth)}</h3>
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

                <div className="absolute right-3 top-3 sm:static">
                  <Button
                    className="h-10 min-h-10 w-10 p-0"
                    variant="ghost"
                    onClick={() => setOpenMenu((value) => (value === periodMonth ? "" : periodMonth))}
                    aria-label={`Actions for ${monthLabel(periodMonth)}`}
                  >
                    <MoreHorizontal size={19} />
                  </Button>
                  {openMenu === periodMonth ? (
                    <div className="absolute right-3 top-14 z-20 w-56 rounded-2xl border border-border bg-surface p-1.5 shadow-[0_18px_48px_rgba(70,55,32,.14)] sm:right-4 sm:top-[58px]">
                      <button
                        type="button"
                        className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-[13px] text-text-secondary hover:bg-subtle hover:text-text-primary"
                        onClick={() => {
                          setExpandedMonth(expanded ? "" : periodMonth);
                          setOpenMenu("");
                        }}
                      >
                        <History size={15} />
                        View version history
                      </button>
                      <button
                        type="button"
                        className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-[13px] text-text-secondary hover:bg-subtle hover:text-text-primary"
                        onClick={() => download(current)}
                      >
                        <Download size={15} />
                        Download original CSV
                      </button>
                      {versions.some((version) => !version.is_active) ? (
                        <button
                          type="button"
                          className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-[13px] text-text-secondary hover:bg-subtle hover:text-text-primary"
                          onClick={() => {
                            setExpandedMonth(periodMonth);
                            setOpenMenu("");
                          }}
                        >
                          <RotateCcw size={15} />
                          Restore previous version
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
                        </div>
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

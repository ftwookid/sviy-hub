"use client";

import { Download, History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
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

export function MileageHistory({
  uploads,
  restoringId,
  onRestore
}: {
  uploads: MileageUpload[];
  restoringId: string;
  onRestore: (upload: MileageUpload) => void;
}) {
  function download(upload: MileageUpload) {
    const blob = new Blob([upload.raw_csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = upload.original_filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!uploads.length) return null;

  return (
    <section className="rounded-[24px] border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-subtle">
          <History size={18} strokeWidth={1.6} className="text-text-secondary" />
        </div>
        <div>
          <h2 className="text-[18px] font-medium text-text-primary">Upload history</h2>
          <p className="text-[12px] text-text-tertiary">Download any source file or restore an older monthly version.</p>
        </div>
      </div>

      <div className="mt-5 divide-y divide-border">
        {uploads.map((upload) => (
          <div key={upload.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-text-primary">{monthLabel(upload.period_month)}</span>
                {upload.is_active ? (
                  <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">Active</span>
                ) : null}
                {!upload.is_complete ? (
                  <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">Partial</span>
                ) : null}
              </div>
              <p className="mt-1 truncate text-[12px] text-text-tertiary">
                {upload.original_filename} · {timestamp(upload.uploaded_at)}
              </p>
              <p className="mt-0.5 text-[12px] text-text-secondary">
                {upload.business_trip_count} trips · {Number(upload.business_miles).toFixed(1)} mi ·{" "}
                {formatCurrency(upload.deduction_value)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button className="min-h-9 px-3 text-[13px]" variant="ghost" onClick={() => download(upload)}>
                <Download size={15} />
                File
              </Button>
              {!upload.is_active ? (
                <Button
                  className="min-h-9 px-3 text-[13px]"
                  variant="soft"
                  disabled={restoringId === upload.id}
                  onClick={() => onRestore(upload)}
                >
                  <RotateCcw size={15} />
                  {restoringId === upload.id ? "Restoring…" : "Restore"}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

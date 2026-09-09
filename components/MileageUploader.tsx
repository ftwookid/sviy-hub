"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CloseButton } from "@/components/ui/CloseButton";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import { hashMileageCsv, parseMileageCsv } from "@/lib/mileageCsv";
import { supabase } from "@/lib/supabase";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useScrollLock } from "@/lib/useScrollLock";
import type { MileageUpload, ParsedMileageCsv } from "@/types/mileage";

type Preview = {
  parsed: ParsedMileageCsv;
  hash: string;
  text: string;
  filename: string;
  existing: MileageUpload | null;
  duplicate: MileageUpload | null;
};

function formatLoggedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function warningCopy(preview: Preview) {
  const { parsed, existing } = preview;
  if (!existing && !parsed.isComplete) {
    return {
      title: `${parsed.periodLabel} appears incomplete`,
      body: `Trips run from ${parsed.coverageStart} through ${parsed.coverageEnd}. You can log this partial month now and replace it later.`
    };
  }
  if (existing?.is_complete && !parsed.isComplete) {
    return {
      title: `${parsed.periodLabel} is already fully logged`,
      body: `The active version has ${existing.business_trip_count} Business trips and ${Number(existing.business_miles).toFixed(1)} miles. This new file ends on ${parsed.coverageEnd} with only ${parsed.businessTrips.length} Business trips. It may be the wrong file.`
    };
  }
  if (existing && !existing.is_complete && parsed.isComplete) {
    return {
      title: `Replace the partial ${parsed.periodLabel} data?`,
      body: `The current version was marked incomplete. This file reaches ${parsed.coverageEnd} and looks like the complete month.`
    };
  }
  if (existing) {
    return {
      title: `${parsed.periodLabel} already has data`,
      body: `This is a different file for the same month. The active version has ${existing.business_trip_count} Business trips and ${Number(existing.business_miles).toFixed(1)} miles; this one has ${parsed.businessTrips.length} trips and ${parsed.businessMiles.toFixed(1)} miles. Confirm only if you intend to replace it.`
    };
  }
  return null;
}

export function MileageUploader({
  userId,
  ownerLabel,
  uploads,
  onSaved,
  open,
  onClose
}: {
  userId: string;
  ownerLabel?: string;
  uploads: MileageUpload[];
  onSaved: (message: string, periodMonth: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pastedCsv, setPastedCsv] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function inspect(text: string, filename: string) {
    setError("");
    try {
      const [parsed, hash] = await Promise.all([Promise.resolve(parseMileageCsv(text)), hashMileageCsv(text)]);
      const duplicate = uploads.find((upload) => upload.content_hash === hash) ?? null;
      const existing = uploads.find((upload) => upload.period_month === parsed.periodMonth && upload.is_active) ?? null;
      const nextPreview = { parsed, hash, text, filename, existing, duplicate };
      setPreview(nextPreview);

      if (!duplicate && parsed.isComplete && !existing) {
        await save(nextPreview);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The CSV could not be read.");
    }
  }

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a CSV exported from MileIQ.");
      return;
    }
    await inspect(await file.text(), file.name);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function save(target = preview) {
    if (!target || !supabase || target.duplicate) return;
    setSaving(true);
    setError("");

    const { data: upload, error: uploadError } = await supabase
      .from("mileage_uploads")
      .insert({
        user_id: userId,
        period_month: target.parsed.periodMonth,
        original_filename: target.filename,
        content_hash: target.hash,
        raw_csv: target.text,
        coverage_start: target.parsed.coverageStart,
        coverage_end: target.parsed.coverageEnd,
        is_complete: target.parsed.isComplete,
        is_active: false,
        business_trip_count: target.parsed.businessTrips.length,
        business_miles: target.parsed.businessMiles,
        deduction_value: target.parsed.deductionValue
      })
      .select("id")
      .single();

    if (uploadError || !upload) {
      setError(uploadError?.message ?? "The upload could not be saved.");
      setSaving(false);
      return;
    }

    const tripRows = target.parsed.businessTrips.map((trip) => ({
      ...trip,
      upload_id: upload.id,
      user_id: userId
    }));
    const { error: tripsError } = await supabase.from("mileage_trips").insert(tripRows);
    if (tripsError) {
      await supabase.from("mileage_uploads").delete().eq("id", upload.id);
      setError(tripsError.message);
      setSaving(false);
      return;
    }

    if (target.existing) {
      const { error: deactivateError } = await supabase
        .from("mileage_uploads")
        .update({ is_active: false })
        .eq("id", target.existing.id);
      if (deactivateError) {
        await supabase.from("mileage_uploads").delete().eq("id", upload.id);
        setError(deactivateError.message);
        setSaving(false);
        return;
      }
    }

    const { error: activateError } = await supabase
      .from("mileage_uploads")
      .update({ is_active: true, activated_at: new Date().toISOString() })
      .eq("id", upload.id);

    if (activateError) {
      if (target.existing) {
        await supabase
          .from("mileage_uploads")
          .update({ is_active: true, activated_at: target.existing.activated_at })
          .eq("id", target.existing.id);
      }
      await supabase.from("mileage_uploads").delete().eq("id", upload.id);
      setError(activateError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setPreview(null);
    setPastedCsv("");
    onSaved(`${target.parsed.periodLabel} mileage logged`, target.parsed.periodMonth);
    onClose();
  }

  const warning = preview ? warningCopy(preview) : null;

  // The preview stacks over the uploader, so it takes the keypress first.
  useEscapeKey(onClose, open);
  useEscapeKey(() => setPreview(null), Boolean(preview) && !saving);
  useScrollLock(open || Boolean(preview));

  if (!open && !preview) return null;

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-end bg-[#1A1916]/25 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
          onClick={onClose}
        >
          <section
            className="slide-over-panel max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[30px] bg-page shadow-[0_24px_80px_rgba(40,31,20,.2)] sm:rounded-[30px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
              <div>
                <h2 className="text-figure-lg font-semibold text-text-primary">
                  Log a MileIQ month
                </h2>
                <p className="mt-1 text-body text-text-secondary">
                  Add the export for {ownerLabel ?? "this user"} and Sviy Hub will identify the month, validate it, and calculate everything automatically.
                </p>
              </div>
              <CloseButton onClick={onClose} />
            </div>

            <div className="grid sm:grid-cols-2">
              <div className="p-5 sm:p-7">
                <div className="flex items-center gap-2 text-caption font-medium uppercase tracking-[0.08em] text-text-tertiary">
                  <Upload size={15} className="text-accent" />
                  Upload CSV
                </div>
                <button
                  type="button"
                  className={cn(
                    "focus-ring mt-3 flex min-h-52 w-full flex-col items-center justify-center rounded-[22px] border border-dashed px-5 text-center transition",
                    dragging ? "border-accent bg-accent-soft/70" : "border-border-emphasis bg-surface hover:bg-subtle"
                  )}
                  onClick={() => inputRef.current?.click()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    handleFile(event.dataTransfer.files[0]);
                  }}
                >
                  <div className="grid h-14 w-14 place-items-center rounded-[20px] bg-accent-soft">
                    <FileSpreadsheet size={25} strokeWidth={1.4} className="text-accent" />
                  </div>
                  <span className="mt-3 text-label font-medium text-text-primary">Choose or drop a CSV</span>
                  <span className="mt-1 max-w-[220px] text-meta leading-relaxed text-text-tertiary">
                    MileIQ export only. Non-Business trips are ignored.
                  </span>
                </button>
                <input
                  ref={inputRef}
                  className="hidden"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => handleFile(event.target.files?.[0])}
                />
              </div>

              <div className="border-t border-border bg-[#FBF9F5] p-5 sm:border-l sm:border-t-0 sm:p-7">
                <label
                  className="flex items-center gap-2 text-caption font-medium uppercase tracking-[0.08em] text-text-tertiary"
                  htmlFor="mileage-csv"
                >
                  <FileSpreadsheet size={15} className="text-accent" />
                  Paste raw CSV
                </label>
                <textarea
                  id="mileage-csv"
                  className="focus-ring mt-3 min-h-52 w-full resize-y rounded-[22px] border border-border bg-surface px-4 py-3 text-list text-text-primary placeholder:text-text-tertiary"
                  value={pastedCsv}
                  placeholder="Paste the complete MileIQ export here…"
                  onChange={(event) => setPastedCsv(event.target.value)}
                />
                <Button
                  className="mt-3 w-full"
                  variant="soft"
                  disabled={!pastedCsv.trim() || saving}
                  onClick={() => inspect(pastedCsv, "pasted-mileiq-export.csv")}
                >
                  Read pasted CSV
                </Button>
              </div>
            </div>
            {error ? (
              <div className="border-t border-danger/10 bg-danger-soft px-5 py-3 text-list text-danger sm:px-7">
                {error}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {preview ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-end bg-[#1A1916]/30 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!saving) setPreview(null);
          }}
        >
          <section
            className="w-full max-w-lg rounded-t-[28px] bg-page p-5 shadow-[0_24px_80px_rgba(40,31,20,.2)] sm:rounded-[28px] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
                    preview.duplicate ? "bg-success-soft" : warning ? "bg-warning-soft" : "bg-accent-soft"
                  )}
                >
                  {preview.duplicate ? (
                    <CheckCircle2 size={21} className="text-success" />
                  ) : (
                    <AlertTriangle size={21} className={warning ? "text-warning" : "text-accent"} />
                  )}
                </div>
                <div>
                  <h2 className="text-figure-lg font-semibold text-text-primary">
                    {preview.duplicate ? "This file was already uploaded" : warning?.title ?? preview.parsed.periodLabel}
                  </h2>
                  <p className="mt-1 text-list leading-relaxed text-text-secondary">
                    {preview.duplicate
                      ? `${preview.parsed.periodLabel} was logged on ${formatLoggedAt(preview.duplicate.uploaded_at)}. Nothing was changed.`
                      : warning?.body}
                  </p>
                </div>
              </div>
              <CloseButton onClick={() => setPreview(null)} />
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-surface p-3">
                <div className="text-caption text-text-tertiary">Business trips</div>
                <div className="mt-1 text-subhead font-medium">{preview.parsed.businessTrips.length}</div>
              </div>
              <div className="rounded-2xl bg-surface p-3">
                <div className="text-caption text-text-tertiary">Miles</div>
                <div className="mt-1 text-subhead font-medium">{preview.parsed.businessMiles.toFixed(1)}</div>
              </div>
              <div className="rounded-2xl bg-surface p-3">
                <div className="text-caption text-text-tertiary">Deduction</div>
                <div className="mt-1 text-subhead font-medium">{formatCurrency(preview.parsed.deductionValue)}</div>
              </div>
            </div>
            <p className="mt-3 text-meta text-text-tertiary">
              {preview.parsed.ignoredTripCount} non-Business trips ignored · rate read from each trip
            </p>

            <div className="mt-6 flex gap-3">
              <Button className="flex-1" variant="ghost" onClick={() => setPreview(null)}>
                {preview.duplicate ? "Close" : "Cancel"}
              </Button>
              {!preview.duplicate ? (
                <Button
                  className="flex-1"
                  variant={preview.existing?.is_complete && !preview.parsed.isComplete ? "danger" : "accent"}
                  disabled={saving}
                  onClick={() => save()}
                >
                  {saving ? "Saving…" : preview.existing ? `Replace ${preview.parsed.periodLabel}` : `Log ${preview.parsed.periodLabel}`}
                </Button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

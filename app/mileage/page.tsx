"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CarFront,
  ChevronDown,
  ChevronUp,
  Download,
  FileUp,
  History,
  Route,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Upload
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import { formatMileageMonth, hashMileageCsv, parseMileIqCsv } from "@/lib/mileage";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { MileageTrip, MileageUpload, ParsedMileageFile } from "@/types/mileage";

type PendingUpload = {
  parsed: ParsedMileageFile;
  hash: string;
  csv: string;
  filename: string | null;
  existing: MileageUpload | null;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatMiles(value: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)} mi`;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

export default function MileagePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, authLoading } = useAuthUser();
  const currentYear = new Date().getFullYear();
  const [uploads, setUploads] = useState<MileageUpload[]>([]);
  const [trips, setTrips] = useState<MileageTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState("all");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [minMiles, setMinMiles] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadMileage = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setSchemaMissing(false);

    let uploadQuery = supabase.from("mileage_uploads").select("*").order("created_at", { ascending: false });
    let tripQuery = supabase
      .from("mileage_trips")
      .select("*, mileage_uploads!inner(is_active)")
      .eq("mileage_uploads.is_active", true)
      .order("start_at", { ascending: false });

    uploadQuery = uploadQuery.eq("user_id", user.id);
    tripQuery = tripQuery.eq("user_id", user.id);

    const [{ data: uploadData, error: uploadError }, { data: tripData, error: tripError }] = await Promise.all([
      uploadQuery,
      tripQuery
    ]);

    if (uploadError?.code === "42P01" || tripError?.code === "42P01") {
      setSchemaMissing(true);
      setLoading(false);
      return;
    }

    if (uploadError || tripError) {
      setError(uploadError?.message ?? tripError?.message ?? "Could not load mileage.");
    }

    setUploads((uploadData ?? []) as MileageUpload[]);
    setTrips(
      (tripData ?? []).map(({ mileage_uploads: _upload, ...trip }) => trip) as MileageTrip[]
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadMileage();
  }, [loadMileage]);

  const activeUploads = useMemo(() => uploads.filter((upload) => upload.is_active), [uploads]);
  const years = useMemo(() => {
    const values = Array.from(new Set(activeUploads.map((upload) => Number(upload.period_month.slice(0, 4)))));
    if (!values.includes(currentYear)) values.push(currentYear);
    return values.sort((a, b) => b - a);
  }, [activeUploads, currentYear]);

  const filteredTrips = useMemo(() => {
    return trips.filter((trip) => {
      const date = new Date(trip.start_at);
      if (date.getFullYear() !== year) return false;
      if (month !== "all" && date.getMonth() !== Number(month)) return false;
      if (minMiles && Number(trip.miles) < Number(minMiles)) return false;
      return true;
    });
  }, [minMiles, month, trips, year]);

  const totals = useMemo(() => {
    const miles = filteredTrips.reduce((sum, trip) => sum + Number(trip.miles), 0);
    const deduction = filteredTrips.reduce((sum, trip) => sum + Number(trip.deduction_value), 0);
    const average = filteredTrips.length ? miles / filteredTrips.length : 0;
    return { miles, deduction, average, count: filteredTrips.length };
  }, [filteredTrips]);

  const monthlyTotals = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const monthTrips = trips.filter((trip) => {
          const date = new Date(trip.start_at);
          return date.getFullYear() === year && date.getMonth() === index;
        });
        return {
          label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(year, index, 1)),
          miles: monthTrips.reduce((sum, trip) => sum + Number(trip.miles), 0)
        };
      }),
    [trips, year]
  );

  const weekdayTotals = useMemo(
    () =>
      WEEKDAYS.map((label, day) => ({
        label,
        miles: filteredTrips
          .filter((trip) => new Date(trip.start_at).getDay() === day)
          .reduce((sum, trip) => sum + Number(trip.miles), 0)
      })),
    [filteredTrips]
  );

  const maxMonth = Math.max(...monthlyTotals.map((item) => item.miles), 1);
  const maxWeekday = Math.max(...weekdayTotals.map((item) => item.miles), 1);
  const busiestDay = weekdayTotals.slice().sort((a, b) => b.miles - a.miles)[0];

  async function prepareUpload() {
    if (!uploadText.trim() || !user || !supabase) return;
    setError("");
    setMessage("");
    setUploading(true);

    try {
      const parsed = parseMileIqCsv(uploadText);
      const hash = await hashMileageCsv(uploadText);
      const duplicate = uploads.find((upload) => upload.source_hash === hash);
      if (duplicate) {
        setMessage(
          `This exact file was already uploaded for ${formatMileageMonth(duplicate.period_month)} on ${new Intl.DateTimeFormat(
            "en-US",
            { month: "short", day: "numeric", year: "numeric" }
          ).format(new Date(duplicate.created_at))}.`
        );
        return;
      }

      const existing = activeUploads.find((upload) => upload.period_month.slice(0, 7) === parsed.periodMonth.slice(0, 7)) ?? null;
      setPending({ parsed, hash, csv: uploadText, filename, existing });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not read this file.");
    } finally {
      setUploading(false);
    }
  }

  async function confirmUpload() {
    if (!pending || !user || !supabase) return;
    setUploading(true);
    setError("");
    const { parsed } = pending;

    const { data: upload, error: uploadError } = await supabase
      .from("mileage_uploads")
      .insert({
        user_id: user.id,
        period_month: parsed.periodMonth,
        period_start: parsed.periodStart,
        period_end: parsed.periodEnd,
        source_filename: pending.filename,
        source_hash: pending.hash,
        source_csv: pending.csv,
        is_complete: parsed.isComplete,
        is_active: false,
        business_trip_count: parsed.trips.length,
        business_miles: parsed.businessMiles,
        deduction_value: parsed.deductionValue
      })
      .select("*")
      .single();

    if (uploadError || !upload) {
      setError(uploadError?.message ?? "Could not save this upload.");
      setUploading(false);
      return;
    }

    const { error: tripsError } = await supabase.from("mileage_trips").insert(
      parsed.trips.map((trip) => ({
        ...trip,
        upload_id: upload.id,
        user_id: user.id
      }))
    );

    if (tripsError) {
      await supabase.from("mileage_uploads").delete().eq("id", upload.id);
      setError(tripsError.message);
      setUploading(false);
      return;
    }

    await supabase
      .from("mileage_uploads")
      .update({ is_active: false })
      .eq("user_id", user.id)
      .eq("period_month", parsed.periodMonth)
      .neq("id", upload.id);

    const { error: activateError } = await supabase.from("mileage_uploads").update({ is_active: true }).eq("id", upload.id);
    if (activateError) {
      setError(activateError.message);
      setUploading(false);
      return;
    }

    setPending(null);
    setUploadText("");
    setFilename(null);
    setMessage(`${formatMileageMonth(parsed.periodMonth)} mileage is now active.`);
    setUploading(false);
    loadMileage();
  }

  async function restoreVersion(upload: MileageUpload) {
    if (!supabase || !user || upload.is_active) return;
    const monthLabel = formatMileageMonth(upload.period_month);
    if (!window.confirm(`Restore the ${monthLabel} version uploaded on ${new Date(upload.created_at).toLocaleDateString()}?`)) return;

    await supabase
      .from("mileage_uploads")
      .update({ is_active: false })
      .eq("user_id", upload.user_id)
      .eq("period_month", upload.period_month);
    const { error: restoreError } = await supabase.from("mileage_uploads").update({ is_active: true }).eq("id", upload.id);
    if (restoreError) setError(restoreError.message);
    else {
      setMessage(`${monthLabel} was restored.`);
      loadMileage();
    }
  }

  function downloadSource(upload: MileageUpload) {
    const blob = new Blob([upload.source_csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = upload.source_filename || `mileiq-${upload.period_month.slice(0, 7)}-${upload.id.slice(0, 8)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function pendingExplanation(value: PendingUpload) {
    const monthLabel = formatMileageMonth(value.parsed.periodMonth);
    if (!value.existing && !value.parsed.isComplete) {
      return {
        title: `${monthLabel} appears incomplete`,
        body: `The Business trips in this file run from ${shortDate(value.parsed.periodStart)} through ${shortDate(
          value.parsed.periodEnd
        )}. You can save this partial month now and replace it later.`
      };
    }
    if (value.existing && !value.existing.is_complete && value.parsed.isComplete) {
      return {
        title: `Replace incomplete ${monthLabel} data?`,
        body: `A partial version is active with ${value.existing.business_trip_count} trips. This file has ${value.parsed.trips.length} trips and appears complete.`
      };
    }
    if (value.existing?.is_complete && !value.parsed.isComplete) {
      return {
        title: `${monthLabel} is already fully logged`,
        body: `The active version has ${value.existing.business_trip_count} trips, but this new file has only ${value.parsed.trips.length}. This may be the wrong export. Replacing it is not recommended.`
      };
    }
    if (value.existing) {
      return {
        title: `Different ${monthLabel} file detected`,
        body: `An active version already exists with ${value.existing.business_trip_count} trips and ${formatMiles(
          Number(value.existing.business_miles)
        )}. This file has ${value.parsed.trips.length} trips and ${formatMiles(value.parsed.businessMiles)}. Saving it will create a new version and make it active.`
      };
    }
    return {
      title: `Log ${monthLabel}?`,
      body: `${value.parsed.trips.length} Business trips, ${formatMiles(value.parsed.businessMiles)}, and ${formatCurrency(
        value.parsed.deductionValue
      )} in deductions were found.`
    };
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <header>
          <h1 className="text-[38px] font-medium leading-[1.06] text-text-primary">Mileage</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-text-secondary">
            Business driving, tax deductions, and the patterns behind every mile.
          </p>
        </header>

        {schemaMissing ? (
          <section className="rounded-[20px] border border-warning/25 bg-warning-soft p-5">
            <h2 className="text-[16px] font-semibold text-text-primary">Mileage database setup needed</h2>
            <p className="mt-1 text-[13px] text-text-secondary">
              Run <code className="font-medium">supabase/mileage-schema.sql</code> in the Supabase SQL Editor, then reload this page.
            </p>
          </section>
        ) : null}

        <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold text-text-primary">Import from MileIQ</h2>
              <p className="mt-0.5 text-[12px] text-text-tertiary">Drop a monthly CSV or paste its contents.</p>
            </div>
            <FileUp size={20} className="text-accent" strokeWidth={1.6} />
          </div>

          <button
            className="focus-ring mt-4 flex min-h-24 w-full flex-col items-center justify-center rounded-xl border border-dashed border-border-emphasis bg-subtle px-4 text-center transition hover:bg-accent-soft/50"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={22} className="text-accent" strokeWidth={1.6} />
            <span className="mt-2 text-[13px] font-medium text-text-primary">{filename ?? "Choose a MileIQ CSV"}</span>
            <span className="mt-0.5 text-[11px] text-text-tertiary">Only Business trips will be imported</span>
          </button>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept=".csv,text/csv"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setFilename(file.name);
              setUploadText(await file.text());
              setError("");
              setMessage("");
            }}
          />

          <textarea
            className="focus-ring mt-3 min-h-24 w-full resize-y rounded-xl border border-border bg-page px-3 py-2.5 text-[12px] text-text-primary placeholder:text-text-tertiary"
            value={uploadText}
            onChange={(event) => {
              setUploadText(event.target.value);
              setFilename(null);
            }}
            placeholder="Or paste the MileIQ CSV here..."
          />
          {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
          {message ? <p className="mt-2 text-[12px] text-success">{message}</p> : null}
          <Button className="mt-3 w-full sm:w-auto" variant="accent" onClick={prepareUpload} disabled={!uploadText.trim() || uploading || schemaMissing}>
            <Sparkles size={17} strokeWidth={1.6} />
            Analyze file
          </Button>
        </section>

        {!schemaMissing ? (
          <>
            <section className="flex flex-wrap items-end gap-3">
              <label className="min-w-28">
                <span className="mb-1 block text-[11px] font-medium text-text-tertiary">Year</span>
                <select
                  className="focus-ring min-h-10 w-full rounded-xl border border-border bg-surface px-3 text-[13px]"
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                >
                  {years.map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className="min-w-36">
                <span className="mb-1 block text-[11px] font-medium text-text-tertiary">Month</span>
                <select
                  className="focus-ring min-h-10 w-full rounded-xl border border-border bg-surface px-3 text-[13px]"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                >
                  <option value="all">All year</option>
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index} value={index}>
                      {new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(year, index, 1))}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="focus-ring flex min-h-10 items-center gap-1 rounded-xl px-3 text-[12px] font-medium text-text-secondary hover:bg-subtle"
                type="button"
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                Advanced
                {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {advancedOpen ? (
                <label className="min-w-36">
                  <span className="mb-1 block text-[11px] font-medium text-text-tertiary">Minimum trip miles</span>
                  <input
                    className="focus-ring min-h-10 w-full rounded-xl border border-border bg-surface px-3 text-[13px]"
                    type="number"
                    min="0"
                    value={minMiles}
                    onChange={(event) => setMinMiles(event.target.value)}
                  />
                </label>
              ) : null}
            </section>

            {loading ? <SkeletonRows /> : (
              <>
                <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric icon={Route} label="Business miles" value={formatMiles(totals.miles)} />
                  <Metric icon={TrendingUp} label="Deduction" value={formatCurrency(totals.deduction)} accent />
                  <Metric icon={CarFront} label="Trips" value={String(totals.count)} />
                  <Metric icon={CalendarDays} label="Average trip" value={formatMiles(totals.average)} />
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                  <AnalyticsCard title={`${year} monthly miles`}>
                    <div className="flex h-36 items-end gap-1.5">
                      {monthlyTotals.map((item) => (
                        <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                          <div
                            className="w-full rounded-t-md bg-accent transition-all"
                            style={{ height: `${Math.max(item.miles ? 8 : 2, (item.miles / maxMonth) * 112)}px` }}
                            title={`${item.label}: ${formatMiles(item.miles)}`}
                          />
                          <span className="text-[9px] text-text-tertiary">{item.label.slice(0, 1)}</span>
                        </div>
                      ))}
                    </div>
                  </AnalyticsCard>

                  <AnalyticsCard title="Driving rhythm">
                    <div className="space-y-2">
                      {weekdayTotals.map((item) => (
                        <div key={item.label} className="grid grid-cols-[32px_1fr_54px] items-center gap-2">
                          <span className="text-[10px] text-text-tertiary">{item.label}</span>
                          <div className="h-2 overflow-hidden rounded-full bg-border">
                            <div className="h-full rounded-full bg-success" style={{ width: `${(item.miles / maxWeekday) * 100}%` }} />
                          </div>
                          <span className="text-right text-[10px] font-medium text-text-secondary">{formatMiles(item.miles)}</span>
                        </div>
                      ))}
                    </div>
                    {totals.count ? (
                      <p className="mt-3 text-[11px] text-text-tertiary">
                        {busiestDay.label} is the busiest driving day in this view.
                      </p>
                    ) : null}
                  </AnalyticsCard>
                </section>

                <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card sm:p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[16px] font-semibold text-text-primary">Recent business trips</h2>
                    <span className="text-[11px] text-text-tertiary">{filteredTrips.length} trips</span>
                  </div>
                  <div className="mt-3 divide-y divide-border">
                    {filteredTrips.slice(0, 12).map((trip) => (
                      <div key={trip.id} className="grid grid-cols-[1fr_auto] gap-3 py-3">
                        <div className="min-w-0">
                          <div className="text-[12px] font-medium text-text-primary">{shortDate(trip.start_at)}</div>
                          <div className="mt-0.5 truncate text-[11px] text-text-tertiary">
                            {trip.start_location || "Start"} → {trip.stop_location || "Stop"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[13px] font-semibold text-text-primary">{formatMiles(Number(trip.miles))}</div>
                          <div className="text-[10px] text-success">{formatCurrency(Number(trip.deduction_value))}</div>
                        </div>
                      </div>
                    ))}
                    {!filteredTrips.length ? <p className="py-8 text-center text-[13px] text-text-tertiary">No business trips in this view.</p> : null}
                  </div>
                </section>

                <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card sm:p-5">
                  <button
                    className="flex w-full items-center justify-between text-left"
                    type="button"
                    onClick={() => setHistoryOpen((open) => !open)}
                  >
                    <span className="flex items-center gap-2 text-[16px] font-semibold text-text-primary">
                      <History size={18} className="text-accent" />
                      Upload history
                    </span>
                    {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {historyOpen ? (
                    <div className="mt-3 divide-y divide-border">
                      {uploads.map((upload) => (
                        <div key={upload.id} className="flex items-center justify-between gap-3 py-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-medium text-text-primary">{formatMileageMonth(upload.period_month)}</span>
                              {upload.is_active ? <span className="rounded-full bg-success-soft px-2 py-0.5 text-[9px] font-medium text-success">Active</span> : null}
                              {!upload.is_complete ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[9px] font-medium text-warning">Partial</span> : null}
                            </div>
                            <p className="mt-0.5 text-[10px] text-text-tertiary">
                              {upload.business_trip_count} trips · {formatMiles(Number(upload.business_miles))} · uploaded {new Date(upload.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              className="focus-ring grid h-9 w-9 place-items-center rounded-lg text-text-tertiary hover:bg-subtle hover:text-text-secondary"
                              type="button"
                              onClick={() => downloadSource(upload)}
                              aria-label={`Download ${formatMileageMonth(upload.period_month)} source CSV`}
                              title="Download source CSV"
                            >
                              <Download size={14} />
                            </button>
                            {!upload.is_active ? (
                            <button
                              className="focus-ring flex min-h-9 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-text-secondary hover:bg-subtle"
                              type="button"
                              onClick={() => restoreVersion(upload)}
                            >
                              <RotateCcw size={13} />
                              Restore
                            </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                      {!uploads.length ? <p className="py-6 text-center text-[12px] text-text-tertiary">No uploads yet.</p> : null}
                    </div>
                  ) : null}
                </section>
              </>
            )}
          </>
        ) : null}
      </div>

      {pending ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[#1A1916]/25 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[440px] rounded-[20px] border border-border bg-surface p-5 shadow-[0_20px_70px_rgba(48,38,24,0.18)]">
            <div className="flex gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h2 className="text-[18px] font-semibold text-text-primary">{pendingExplanation(pending).title}</h2>
                <p className="mt-1 text-[13px] leading-5 text-text-secondary">{pendingExplanation(pending).body}</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-subtle p-3 text-[12px] text-text-secondary">
              <div className="flex justify-between"><span>Business trips</span><strong>{pending.parsed.trips.length}</strong></div>
              <div className="mt-1 flex justify-between"><span>Business miles</span><strong>{formatMiles(pending.parsed.businessMiles)}</strong></div>
              <div className="mt-1 flex justify-between"><span>Deduction</span><strong>{formatCurrency(pending.parsed.deductionValue)}</strong></div>
            </div>
            <div className="mt-5 flex gap-2">
              <Button className="flex-1" variant="soft" onClick={() => setPending(null)}>Cancel</Button>
              <Button className="flex-1" variant="accent" onClick={confirmUpload} disabled={uploading}>
                {pending.existing ? "Save new version" : "Log mileage"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  accent = false
}: {
  icon: typeof Route;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[18px] border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2 text-[11px] font-medium text-text-tertiary">
        <Icon size={15} strokeWidth={1.6} />
        {label}
      </div>
      <div className={cn("mt-2 text-[22px] font-semibold leading-none text-text-primary", accent && "text-amber-700")}>{value}</div>
    </div>
  );
}

function AnalyticsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card sm:p-5">
      <h2 className="mb-4 text-[15px] font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

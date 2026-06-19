"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CarFront,
  ChevronDown,
  ChevronUp,
  MapPin,
  ReceiptText,
  Route,
  SlidersHorizontal,
  Sparkles
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MileageHistory } from "@/components/MileageHistory";
import { MileageUploader } from "@/components/MileageUploader";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import { MONTHS } from "@/lib/months";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { MileageTrip, MileageUpload } from "@/types/mileage";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dateFromTimestamp(value: string) {
  return new Date(value.length === 10 ? `${value}T12:00:00` : value);
}

function compactDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(dateFromTimestamp(value));
}

function fullDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(dateFromTimestamp(value));
}

function Stat({
  icon: Icon,
  label,
  value,
  detail
}: {
  icon: typeof Route;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[22px] border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">{label}</span>
        <Icon size={17} strokeWidth={1.5} className="text-accent" />
      </div>
      <div className="mt-3 text-[25px] font-medium leading-none tracking-[-0.02em] text-text-primary">{value}</div>
      <div className="mt-2 text-[12px] text-text-tertiary">{detail}</div>
    </div>
  );
}

export default function MileagePage() {
  const now = useMemo(() => new Date(), []);
  const { user, authLoading } = useAuthUser();
  const [uploads, setUploads] = useState<MileageUpload[]>([]);
  const [trips, setTrips] = useState<MileageTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");
  const [toast, setToast] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(-1);
  const [advanced, setAdvanced] = useState(false);
  const [weekday, setWeekday] = useState(-1);
  const [minMiles, setMinMiles] = useState("");
  const [maxMiles, setMaxMiles] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [restoringId, setRestoringId] = useState("");

  const loadMileage = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setSchemaError("");

    const { data: uploadData, error: uploadError } = await supabase
      .from("mileage_uploads")
      .select("*")
      .eq("user_id", user.id)
      .order("period_month", { ascending: false })
      .order("uploaded_at", { ascending: false });

    if (uploadError) {
      setSchemaError(uploadError.message);
      setLoading(false);
      return;
    }

    const nextUploads = (uploadData ?? []) as MileageUpload[];
    const activeIds = nextUploads.filter((upload) => upload.is_active).map((upload) => upload.id);
    let nextTrips: MileageTrip[] = [];

    if (activeIds.length) {
      const { data: tripData, error: tripError } = await supabase
        .from("mileage_trips")
        .select("*")
        .eq("user_id", user.id)
        .in("upload_id", activeIds)
        .order("start_at", { ascending: false });
      if (tripError) {
        setSchemaError(tripError.message);
        setLoading(false);
        return;
      }
      nextTrips = (tripData ?? []) as MileageTrip[];
    }

    setUploads(nextUploads);
    setTrips(nextTrips);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadMileage();
  }, [loadMileage]);

  const availableYears = useMemo(() => {
    const values = Array.from(new Set(uploads.map((upload) => Number(upload.period_month.slice(0, 4)))));
    if (!values.includes(now.getFullYear())) values.push(now.getFullYear());
    return values.sort((a, b) => b - a);
  }, [now, uploads]);

  const yearTrips = useMemo(
    () => trips.filter((trip) => dateFromTimestamp(trip.start_at).getFullYear() === year),
    [trips, year]
  );

  const filteredTrips = useMemo(() => {
    const minimum = minMiles === "" ? null : Number(minMiles);
    const maximum = maxMiles === "" ? null : Number(maxMiles);
    const search = locationSearch.trim().toLowerCase();

    return yearTrips.filter((trip) => {
      const date = dateFromTimestamp(trip.start_at);
      if (month >= 0 && date.getMonth() !== month) return false;
      if (weekday >= 0 && date.getDay() !== weekday) return false;
      if (minimum !== null && Number(trip.miles) < minimum) return false;
      if (maximum !== null && Number(trip.miles) > maximum) return false;
      if (search) {
        const haystack = `${trip.start_location ?? ""} ${trip.stop_location ?? ""} ${trip.purpose ?? ""} ${trip.notes ?? ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [locationSearch, maxMiles, minMiles, month, weekday, yearTrips]);

  const businessMiles = filteredTrips.reduce((sum, trip) => sum + Number(trip.miles), 0);
  const deduction = filteredTrips.reduce((sum, trip) => sum + Number(trip.deduction_value), 0);
  const averageTrip = filteredTrips.length ? businessMiles / filteredTrips.length : 0;

  const dayTotals = useMemo(() => {
    const totals = new Map<string, { miles: number; trips: number }>();
    filteredTrips.forEach((trip) => {
      const key = trip.start_at.slice(0, 10);
      const current = totals.get(key) ?? { miles: 0, trips: 0 };
      totals.set(key, { miles: current.miles + Number(trip.miles), trips: current.trips + 1 });
    });
    return Array.from(totals.entries()).sort((a, b) => b[1].miles - a[1].miles);
  }, [filteredTrips]);

  const monthly = useMemo(
    () =>
      MONTHS.map((label, index) => {
        const monthTrips = yearTrips.filter((trip) => dateFromTimestamp(trip.start_at).getMonth() === index);
        return {
          label,
          miles: monthTrips.reduce((sum, trip) => sum + Number(trip.miles), 0),
          deduction: monthTrips.reduce((sum, trip) => sum + Number(trip.deduction_value), 0),
          trips: monthTrips.length
        };
      }),
    [yearTrips]
  );
  const maxMonthlyMiles = Math.max(...monthly.map((item) => item.miles), 1);

  const weekdayTotals = useMemo(
    () =>
      WEEKDAYS.map((label, index) => {
        const matching = filteredTrips.filter((trip) => dateFromTimestamp(trip.start_at).getDay() === index);
        return {
          label,
          miles: matching.reduce((sum, trip) => sum + Number(trip.miles), 0),
          trips: matching.length
        };
      }),
    [filteredTrips]
  );
  const maxWeekdayMiles = Math.max(...weekdayTotals.map((item) => item.miles), 1);
  const busiestWeekday = weekdayTotals.slice().sort((a, b) => b.miles - a.miles)[0];

  const distanceBands = useMemo(() => {
    const bands = [
      { label: "Under 5 mi", count: 0 },
      { label: "5–10 mi", count: 0 },
      { label: "10–20 mi", count: 0 },
      { label: "20+ mi", count: 0 }
    ];
    filteredTrips.forEach((trip) => {
      const miles = Number(trip.miles);
      if (miles < 5) bands[0].count += 1;
      else if (miles < 10) bands[1].count += 1;
      else if (miles < 20) bands[2].count += 1;
      else bands[3].count += 1;
    });
    return bands;
  }, [filteredTrips]);
  const maxBand = Math.max(...distanceBands.map((band) => band.count), 1);

  function flash(message: string) {
    setToast(message);
    loadMileage();
    window.setTimeout(() => setToast(""), 2600);
  }

  async function restore(upload: MileageUpload) {
    if (!supabase || !user) return;
    const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
      dateFromTimestamp(upload.period_month)
    );
    const confirmed = window.confirm(
      `Restore this ${label} version? It will become the version used by every Mileage dashboard.`
    );
    if (!confirmed) return;

    setRestoringId(upload.id);
    const current = uploads.find((item) => item.period_month === upload.period_month && item.is_active);
    if (current) {
      const { error } = await supabase.from("mileage_uploads").update({ is_active: false }).eq("id", current.id);
      if (error) {
        window.alert(error.message);
        setRestoringId("");
        return;
      }
    }

    const { error } = await supabase
      .from("mileage_uploads")
      .update({ is_active: true, activated_at: new Date().toISOString() })
      .eq("id", upload.id);
    if (error) {
      if (current) await supabase.from("mileage_uploads").update({ is_active: true }).eq("id", current.id);
      window.alert(error.message);
      setRestoringId("");
      return;
    }

    setRestoringId("");
    flash(`${label} restored`);
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      <div className="space-y-7">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-accent">
              <Sparkles size={14} />
              Driving intelligence
            </div>
            <h1 className="mt-2 text-[38px] font-medium leading-[1.05] tracking-[-0.02em] text-text-primary">Mileage</h1>
            <p className="mt-2 max-w-xl text-[16px] text-text-secondary">
              Your business driving, tax deduction, and patterns — without the spreadsheet archaeology.
            </p>
          </div>
        </header>

        {schemaError ? (
          <section className="rounded-[24px] border border-warning/20 bg-warning-soft p-5">
            <h2 className="font-medium text-text-primary">Mileage needs its database tables</h2>
            <p className="mt-1 text-[13px] text-text-secondary">
              Run <code className="rounded bg-white/70 px-1.5 py-0.5">supabase/mileage-schema.sql</code> in the
              Supabase SQL Editor, then refresh this page.
            </p>
            <p className="mt-2 text-[11px] text-warning">{schemaError}</p>
          </section>
        ) : (
          <MileageUploader userId={user.id} uploads={uploads} onSaved={flash} />
        )}

        <section className="flex flex-col gap-3 rounded-[22px] border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-end">
          <div className="grid flex-1 grid-cols-2 gap-3 sm:max-w-md">
            <Select label="Tax year" value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {availableYears.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
            <Select label="Month" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              <option value={-1}>All months</option>
              {MONTHS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <Button className="sm:ml-auto" variant="ghost" onClick={() => setAdvanced((value) => !value)}>
            <SlidersHorizontal size={16} />
            Advanced filters
            {advanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </Button>
        </section>

        <div className="collapsible-grid" data-open={advanced}>
          <div>
            <section className="grid gap-3 rounded-[22px] border border-border bg-surface p-4 shadow-card sm:grid-cols-4">
              <Select label="Day of week" value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>
                <option value={-1}>Any day</option>
                {WEEKDAYS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </Select>
              <Input label="Minimum miles" type="number" min="0" value={minMiles} onChange={(e) => setMinMiles(e.target.value)} />
              <Input label="Maximum miles" type="number" min="0" value={maxMiles} onChange={(e) => setMaxMiles(e.target.value)} />
              <Input
                label="Place or note"
                value={locationSearch}
                placeholder="Client, address…"
                onChange={(e) => setLocationSearch(e.target.value)}
              />
            </section>
          </div>
        </div>

        {loading ? (
          <SkeletonRows />
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat icon={ReceiptText} label="Deduction" value={formatCurrency(deduction)} detail={`${year} selected view`} />
              <Stat icon={Route} label="Business miles" value={businessMiles.toFixed(1)} detail={`${filteredTrips.length} trips`} />
              <Stat icon={CarFront} label="Average trip" value={`${averageTrip.toFixed(1)} mi`} detail="Business distance" />
              <Stat
                icon={CalendarDays}
                label="Busiest day"
                value={dayTotals[0] ? compactDate(dayTotals[0][0]) : "—"}
                detail={dayTotals[0] ? `${dayTotals[0][1].miles.toFixed(1)} miles · ${dayTotals[0][1].trips} trips` : "No trips yet"}
              />
            </section>

            {trips.length === 0 ? (
              <section className="rounded-[28px] border border-border bg-surface px-6 py-16 text-center shadow-card">
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] bg-accent-soft">
                  <Route size={32} strokeWidth={1.4} className="text-accent" />
                </div>
                <h2 className="mt-5 text-[22px] font-medium text-text-primary">Your driving story starts here</h2>
                <p className="mx-auto mt-2 max-w-md text-[14px] text-text-secondary">
                  Upload a MileIQ month and this space will reveal mileage trends, busy days, trip patterns, and your live tax deduction.
                </p>
              </section>
            ) : (
              <>
                <section className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
                  <div className="rounded-[24px] border border-border bg-surface p-5 shadow-card sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-[18px] font-medium text-text-primary">Year in motion</h2>
                        <p className="mt-1 text-[12px] text-text-tertiary">Business miles and deduction by month</p>
                      </div>
                      <div className="text-right text-[12px] text-text-secondary">
                        {yearTrips.reduce((sum, trip) => sum + Number(trip.miles), 0).toFixed(1)} mi
                      </div>
                    </div>
                    <div className="mt-6 flex h-48 items-end gap-1.5 sm:gap-2">
                      {monthly.map((item, index) => (
                        <button
                          key={item.label}
                          type="button"
                          className="group flex h-full min-w-0 flex-1 flex-col justify-end"
                          onClick={() => setMonth(index)}
                          title={`${item.label}: ${item.miles.toFixed(1)} miles, ${formatCurrency(item.deduction)}`}
                        >
                          <div className="relative flex h-[164px] items-end overflow-hidden rounded-t-lg bg-subtle">
                            <div
                              className={cn(
                                "w-full rounded-t-lg transition-all group-hover:bg-[#B99659]",
                                month === index ? "bg-text-primary" : "bg-accent"
                              )}
                              style={{ height: item.miles ? `${Math.max(7, (item.miles / maxMonthlyMiles) * 100)}%` : "0%" }}
                            />
                          </div>
                          <span className="mt-2 truncate text-[10px] text-text-tertiary">{item.label.slice(0, 1)}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-border bg-[#F5EFE3] p-5 shadow-card sm:p-6">
                    <div className="flex items-center gap-2 text-accent">
                      <Sparkles size={17} />
                      <span className="text-[12px] font-medium uppercase tracking-[0.05em]">Pattern note</span>
                    </div>
                    <p className="mt-5 font-serif text-[26px] italic leading-[1.25] text-text-primary">
                      {filteredTrips.length
                        ? `${busiestWeekday.label}s carry the most road time.`
                        : "Choose another period to reveal its rhythm."}
                    </p>
                    <p className="mt-4 text-[13px] leading-relaxed text-text-secondary">
                      {filteredTrips.length
                        ? `${busiestWeekday.trips} trips account for ${busiestWeekday.miles.toFixed(1)} business miles on ${busiestWeekday.label}s in this view.`
                        : "No Business trips match the current filters."}
                    </p>
                  </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[24px] border border-border bg-surface p-5 shadow-card sm:p-6">
                    <h2 className="text-[18px] font-medium text-text-primary">Weekly rhythm</h2>
                    <p className="mt-1 text-[12px] text-text-tertiary">Where the driving week tends to concentrate</p>
                    <div className="mt-5 space-y-3">
                      {weekdayTotals.map((item) => (
                        <div key={item.label} className="grid grid-cols-[42px_1fr_62px] items-center gap-3">
                          <span className="text-[11px] text-text-secondary">{item.label.slice(0, 3)}</span>
                          <div className="h-2.5 overflow-hidden rounded-full bg-subtle">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${item.miles ? Math.max(3, (item.miles / maxWeekdayMiles) * 100) : 0}%` }}
                            />
                          </div>
                          <span className="text-right text-[11px] font-medium text-text-primary">{item.miles.toFixed(1)} mi</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-border bg-surface p-5 shadow-card sm:p-6">
                    <h2 className="text-[18px] font-medium text-text-primary">Trip distance mix</h2>
                    <p className="mt-1 text-[12px] text-text-tertiary">Quick hops versus longer client runs</p>
                    <div className="mt-6 grid h-36 grid-cols-4 items-end gap-3">
                      {distanceBands.map((band) => (
                        <div key={band.label} className="flex h-full flex-col items-center justify-end">
                          <span className="mb-2 text-[11px] font-medium text-text-primary">{band.count}</span>
                          <div
                            className="w-full rounded-t-xl bg-[#D8C7A5]"
                            style={{ height: band.count ? `${Math.max(8, (band.count / maxBand) * 100)}%` : "0%" }}
                          />
                          <span className="mt-2 text-center text-[10px] leading-tight text-text-tertiary">{band.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="rounded-[24px] border border-border bg-surface p-5 shadow-card sm:p-6">
                  <div>
                    <h2 className="text-[18px] font-medium text-text-primary">Business trips</h2>
                    <p className="mt-1 text-[12px] text-text-tertiary">
                      {filteredTrips.length} trips in this view · non-Business driving never appears here
                    </p>
                  </div>
                  {filteredTrips.length ? (
                    <div className="mt-5 divide-y divide-border">
                      {filteredTrips.slice(0, 50).map((trip) => (
                        <div key={trip.id} className="grid gap-2 py-4 first:pt-0 sm:grid-cols-[120px_1fr_92px_92px] sm:items-center">
                          <div>
                            <div className="text-[13px] font-medium text-text-primary">{fullDate(trip.start_at)}</div>
                            <div className="text-[11px] text-text-tertiary">
                              {dateFromTimestamp(trip.start_at).toLocaleTimeString("en-US", {
                                hour: "numeric",
                                minute: "2-digit"
                              })}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 truncate text-[13px] text-text-secondary">
                              <MapPin size={13} className="shrink-0 text-accent" />
                              <span className="truncate">{trip.start_location || "Start not named"}</span>
                              <span className="text-text-tertiary">→</span>
                              <span className="truncate">{trip.stop_location || "Stop not named"}</span>
                            </div>
                            {trip.purpose || trip.notes ? (
                              <div className="mt-1 truncate text-[11px] text-text-tertiary">{trip.purpose || trip.notes}</div>
                            ) : null}
                          </div>
                          <div className="text-[13px] font-medium text-text-primary sm:text-right">
                            {Number(trip.miles).toFixed(1)} mi
                          </div>
                          <div className="text-[13px] font-medium text-success sm:text-right">
                            {formatCurrency(trip.deduction_value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl bg-subtle py-10 text-center text-[13px] text-text-secondary">
                      No Business trips match these filters.
                    </div>
                  )}
                </section>
              </>
            )}

            <MileageHistory uploads={uploads} restoringId={restoringId} onRestore={restore} />
          </>
        )}
      </div>
      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}

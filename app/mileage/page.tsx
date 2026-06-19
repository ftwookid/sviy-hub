"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CarFront,
  ChevronDown,
  ChevronUp,
  Clock3,
  Gauge,
  Plus,
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
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { MileageTrip, MileageUpload } from "@/types/mileage";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

type Period = "month" | "year" | "all";
type DriveFilter = "all" | "short" | "long";

function dateFromTimestamp(value: string) {
  return new Date(value.length === 10 ? `${value}T12:00:00` : value);
}

function dateKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function compactDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(dateFromTimestamp(value));
}

function tooltipDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(
    dateFromTimestamp(value)
  );
}

function monthName(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function destinationArea(value: string | null) {
  if (!value?.trim()) return "Area not named";
  const pieces = value
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean);
  if (pieces.length === 1) return pieces[0];

  const withoutCountry = pieces.filter((piece) => !/^(usa|united states)$/i.test(piece));
  const last = withoutCountry[withoutCountry.length - 1] ?? "";
  const looksLikeState = /^[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i.test(last);
  if (looksLikeState && withoutCountry.length > 1) return withoutCountry[withoutCountry.length - 2];
  return withoutCountry[withoutCountry.length - 1] || pieces[0];
}

function daysBetween(start: Date, end: Date) {
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const days: Date[] = [];
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function SecondaryStat({
  icon: Icon,
  label,
  value,
  detail
}: {
  icon: typeof Route;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">{label}</span>
        <Icon size={16} strokeWidth={1.5} className="text-accent" />
      </div>
      <div className="mt-3 text-[22px] font-medium leading-none tracking-[-0.02em] text-text-primary">{value}</div>
      {detail ? <div className="mt-2 text-[11px] text-text-tertiary">{detail}</div> : null}
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
  const [importOpen, setImportOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [selectedMonth, setSelectedMonth] = useState(dateKey(new Date(now.getFullYear(), now.getMonth(), 1)).slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [driveFilter, setDriveFilter] = useState<DriveFilter>("all");
  const [advanced, setAdvanced] = useState(false);
  const [minMiles, setMinMiles] = useState("");
  const [maxMiles, setMaxMiles] = useState("");
  const [destination, setDestination] = useState("");
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [visibleDriveCount, setVisibleDriveCount] = useState(12);
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

    const activeUploads = nextUploads.filter((upload) => upload.is_active);
    if (activeUploads.length) {
      const latestMonth = activeUploads[0].period_month.slice(0, 7);
      const existingMonths = new Set(activeUploads.map((upload) => upload.period_month.slice(0, 7)));
      setSelectedMonth((current) => (existingMonths.has(current) ? current : latestMonth));
      setSelectedYear((current) => {
        const years = new Set(activeUploads.map((upload) => Number(upload.period_month.slice(0, 4))));
        return years.has(current) ? current : Number(latestMonth.slice(0, 4));
      });
    }

    setUploads(nextUploads);
    setTrips(nextTrips);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadMileage();
  }, [loadMileage]);

  const availableMonths = useMemo(
    () =>
      Array.from(
        new Set(uploads.filter((upload) => upload.is_active).map((upload) => upload.period_month.slice(0, 7)))
      ).sort((a, b) => b.localeCompare(a)),
    [uploads]
  );

  const availableYears = useMemo(() => {
    const values = Array.from(
      new Set(uploads.filter((upload) => upload.is_active).map((upload) => Number(upload.period_month.slice(0, 4))))
    );
    if (!values.includes(now.getFullYear())) values.push(now.getFullYear());
    return values.sort((a, b) => b - a);
  }, [now, uploads]);

  const periodTrips = useMemo(
    () =>
      trips.filter((trip) => {
        const tripDate = dateFromTimestamp(trip.start_at);
        if (period === "month") return trip.start_at.slice(0, 7) === selectedMonth;
        if (period === "year") return tripDate.getFullYear() === selectedYear;
        return true;
      }),
    [period, selectedMonth, selectedYear, trips]
  );

  const periodBounds = useMemo(() => {
    if (period === "month") {
      const [year, month] = selectedMonth.split("-").map(Number);
      return { start: new Date(year, month - 1, 1), end: new Date(year, month, 0) };
    }
    if (period === "year") return { start: new Date(selectedYear, 0, 1), end: new Date(selectedYear, 11, 31) };
    if (periodTrips.length) {
      const timestamps = periodTrips.map((trip) => dateFromTimestamp(trip.start_at).getTime());
      return { start: new Date(Math.min(...timestamps)), end: new Date(Math.max(...timestamps)) };
    }
    return { start: now, end: now };
  }, [now, period, periodTrips, selectedMonth, selectedYear]);

  const periodLabel =
    period === "month" ? monthName(selectedMonth) : period === "year" ? String(selectedYear) : "All time";

  const businessMiles = periodTrips.reduce((sum, trip) => sum + Number(trip.miles), 0);
  const deduction = periodTrips.reduce((sum, trip) => sum + Number(trip.deduction_value), 0);
  const activeDates = new Set(periodTrips.map((trip) => trip.start_at.slice(0, 10)));
  const totalDays = daysBetween(periodBounds.start, periodBounds.end).length;
  const averageTrip = periodTrips.length ? businessMiles / periodTrips.length : 0;
  const longestTrip = periodTrips.reduce<MileageTrip | null>(
    (longest, trip) => (!longest || Number(trip.miles) > Number(longest.miles) ? trip : longest),
    null
  );

  const rates = Array.from(new Set(periodTrips.map((trip) => Number(trip.rate)))).sort((a, b) => a - b);
  const rateLabel = rates.length
    ? rates.length === 1
      ? `${(rates[0] * 100).toFixed(rates[0] * 100 % 1 ? 1 : 0)}¢ per mile`
      : `${(rates[0] * 100).toFixed(1)}–${(rates[rates.length - 1] * 100).toFixed(1)}¢ per mile`
    : "Rate appears after import";

  const dailyData = useMemo(() => {
    const totals = new Map<string, number>();
    periodTrips.forEach((trip) => {
      const key = trip.start_at.slice(0, 10);
      totals.set(key, (totals.get(key) ?? 0) + Number(trip.miles));
    });
    return daysBetween(periodBounds.start, periodBounds.end).map((date) => ({
      date: dateKey(date),
      miles: totals.get(dateKey(date)) ?? 0
    }));
  }, [periodBounds.end, periodBounds.start, periodTrips]);
  const maxDailyMiles = Math.max(...dailyData.map((day) => day.miles), 1);
  const biggestDay = dailyData.slice().sort((a, b) => b.miles - a.miles)[0];

  const weekdayData = useMemo(
    () =>
      MONDAY_FIRST.map((weekdayIndex) => {
        const matching = periodTrips.filter((trip) => dateFromTimestamp(trip.start_at).getDay() === weekdayIndex);
        return {
          index: weekdayIndex,
          label: WEEKDAYS[weekdayIndex],
          miles: matching.reduce((sum, trip) => sum + Number(trip.miles), 0),
          trips: matching.length
        };
      }),
    [periodTrips]
  );
  const busiestWeekday = weekdayData.slice().sort((a, b) => b.miles - a.miles)[0];
  const maxWeekdayMiles = Math.max(...weekdayData.map((day) => day.miles), 1);

  const areaData = useMemo(() => {
    const areas = new Map<string, { miles: number; trips: number }>();
    periodTrips.forEach((trip) => {
      const area = destinationArea(trip.stop_location);
      const current = areas.get(area) ?? { miles: 0, trips: 0 };
      areas.set(area, { miles: current.miles + Number(trip.miles), trips: current.trips + 1 });
    });
    return Array.from(areas.entries())
      .map(([area, values]) => ({ area, ...values }))
      .sort((a, b) => b.miles - a.miles);
  }, [periodTrips]);
  const maxAreaMiles = Math.max(...areaData.map((area) => area.miles), 1);

  const destinationOptions = useMemo(
    () => Array.from(new Set(periodTrips.map((trip) => destinationArea(trip.stop_location)))).sort(),
    [periodTrips]
  );

  const listTrips = useMemo(() => {
    const minimum = minMiles === "" ? null : Number(minMiles);
    const maximum = maxMiles === "" ? null : Number(maxMiles);
    return periodTrips.filter((trip) => {
      const miles = Number(trip.miles);
      const time = trip.start_at.slice(11, 16);
      if (driveFilter === "short" && miles >= 2) return false;
      if (driveFilter === "long" && miles <= 10) return false;
      if (minimum !== null && miles < minimum) return false;
      if (maximum !== null && miles > maximum) return false;
      if (destination && destinationArea(trip.stop_location) !== destination) return false;
      if (timeStart && time < timeStart) return false;
      if (timeEnd && time > timeEnd) return false;
      return true;
    });
  }, [destination, driveFilter, maxMiles, minMiles, periodTrips, timeEnd, timeStart]);

  useEffect(() => {
    setVisibleDriveCount(12);
  }, [destination, driveFilter, listTrips.length, maxMiles, minMiles, period, selectedMonth, selectedYear, timeEnd, timeStart]);

  const insight = useMemo(() => {
    if (!periodTrips.length || !busiestWeekday) return "Import a month to start uncovering patterns in your business driving.";
    const share = businessMiles ? Math.round((busiestWeekday.miles / businessMiles) * 100) : 0;
    if (biggestDay?.miles) {
      return `${busiestWeekday.label}s lead your driving week with ${busiestWeekday.miles.toFixed(
        1
      )} miles — ${share}% of the period total. Your biggest single day was ${tooltipDate(biggestDay.date)} at ${biggestDay.miles.toFixed(
        1
      )} miles.`;
    }
    return `${busiestWeekday.label}s are your busiest driving day in this period.`;
  }, [biggestDay, busiestWeekday, businessMiles, periodTrips]);

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
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-[38px] font-medium leading-[1.06] tracking-[-0.01em] text-text-primary">Mileage</h1>
            <p className="mt-2 max-w-xl text-[16px] text-text-secondary">
              Business driving, tax deductions, and the patterns behind every mile.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="grid h-7 grid-cols-3 rounded-lg border border-border bg-subtle p-0.5">
              {(["month", "year", "all"] as Period[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    "focus-ring min-w-14 rounded-md px-2 text-[10px] font-medium leading-none transition duration-150 ease-out",
                    period === value ? "bg-surface text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-secondary"
                  )}
                  onClick={() => setPeriod(value)}
                >
                  {value === "all" ? "All time" : value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
            <Button variant="accent" onClick={() => setImportOpen(true)}>
              <Plus size={18} strokeWidth={1.6} />
              Import month
            </Button>
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
        ) : null}

        {period !== "all" ? (
          <div className="max-w-[230px]">
            {period === "month" ? (
              <Select label="Showing month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
                {availableMonths.length ? (
                  availableMonths.map((month) => (
                    <option key={month} value={month}>
                      {monthName(month)}
                    </option>
                  ))
                ) : (
                  <option value={selectedMonth}>{monthName(selectedMonth)}</option>
                )}
              </Select>
            ) : (
              <Select label="Showing year" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
            )}
          </div>
        ) : null}

        {loading ? (
          <SkeletonRows />
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2">
              <article className="rounded-[28px] border border-border bg-surface p-5 shadow-card sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
                    Business miles · {periodLabel}
                  </span>
                  <Route size={20} strokeWidth={1.5} className="text-accent" />
                </div>
                <div className="mt-5 text-[38px] font-medium leading-[1.06] tracking-[-0.01em] text-text-primary">
                  {businessMiles.toFixed(1)}
                </div>
                <p className="mt-4 text-[13px] text-text-secondary">
                  {periodTrips.length} drives across {activeDates.size} active {activeDates.size === 1 ? "day" : "days"}
                </p>
              </article>

              <article className="rounded-[28px] border border-border bg-[#F5EFE3] p-5 shadow-card sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
                    Tax deduction · {periodLabel}
                  </span>
                  <Sparkles size={20} strokeWidth={1.5} className="text-accent" />
                </div>
                <div className="mt-5 text-[38px] font-medium leading-[1.06] tracking-[-0.01em] text-text-primary">
                  {formatCurrency(deduction)}
                </div>
                <p className="mt-4 text-[13px] text-text-secondary">
                  {rateLabel} · read directly from your MileIQ file
                </p>
              </article>
            </section>

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SecondaryStat icon={Gauge} label="Average drive" value={`${averageTrip.toFixed(1)} mi`} />
              <SecondaryStat
                icon={CarFront}
                label="Longest drive"
                value={longestTrip ? `${Number(longestTrip.miles).toFixed(1)} mi` : "—"}
                detail={longestTrip ? destinationArea(longestTrip.stop_location) : undefined}
              />
              <SecondaryStat
                icon={CalendarDays}
                label="Busiest weekday"
                value={periodTrips.length ? busiestWeekday.label : "—"}
                detail={periodTrips.length ? `${busiestWeekday.miles.toFixed(1)} miles` : undefined}
              />
              <SecondaryStat
                icon={Clock3}
                label="Active days"
                value={`${activeDates.size} of ${totalDays}`}
                detail={totalDays ? `${Math.round((activeDates.size / totalDays) * 100)}% of the period` : undefined}
              />
            </section>

            <aside className="flex items-start gap-3 rounded-[18px] border-l-[3px] border-accent bg-accent-soft/55 px-4 py-4 sm:px-5">
              <Sparkles size={18} className="mt-0.5 shrink-0 text-accent" />
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-secondary">What stands out</div>
                <p className="mt-1 text-[14px] leading-relaxed text-text-secondary">{insight}</p>
              </div>
            </aside>

            <section className="rounded-[24px] border border-border bg-surface p-5 shadow-card sm:p-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-[18px] font-medium text-text-primary">Daily miles · {periodLabel}</h2>
                  <p className="mt-1 text-[12px] text-text-tertiary">Hover over any day for the exact mileage.</p>
                </div>
                <div className="text-right text-[12px] text-text-secondary">{activeDates.size} driving days</div>
              </div>
              <div className="mt-6 overflow-x-auto pb-6">
                <div
                  className="flex h-56 items-end gap-1.5 border-b border-border px-1"
                  style={{ minWidth: period === "month" ? "100%" : `${Math.max(900, dailyData.length * 9)}px` }}
                >
                  {dailyData.map((day, index) => (
                    <div key={day.date} className="group relative flex h-full min-w-0 flex-1 items-end">
                      <div
                        className={cn(
                          "w-full rounded-t-[5px] transition",
                          day.miles ? "bg-accent group-hover:bg-[#B79250]" : "bg-subtle"
                        )}
                        style={{ height: day.miles ? `${Math.max(4, (day.miles / maxDailyMiles) * 100)}%` : "2px" }}
                      />
                      <div className="pointer-events-none absolute left-1/2 top-2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-text-primary px-2.5 py-1.5 text-[11px] text-white shadow-lg group-hover:block">
                        {tooltipDate(day.date)} · {day.miles.toFixed(1)} mi
                      </div>
                      {index % Math.max(1, Math.ceil(dailyData.length / 8)) === 0 ? (
                        <span className="absolute -bottom-5 left-0 text-[11px] text-text-tertiary">{compactDate(day.date)}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-[24px] border border-border bg-surface p-5 shadow-card sm:p-6">
                <h2 className="text-[18px] font-medium text-text-primary">By weekday</h2>
                <p className="mt-1 text-[12px] text-text-tertiary">Total mileage from Monday through Sunday</p>
                <div className="mt-5 space-y-3">
                  {weekdayData.map((day) => {
                    const busiest = periodTrips.length > 0 && day.index === busiestWeekday.index;
                    return (
                      <div key={day.label} className="grid grid-cols-[38px_1fr_66px] items-center gap-3">
                        <span className={cn("text-[11px]", busiest ? "font-medium text-text-primary" : "text-text-secondary")}>
                          {day.label.slice(0, 3)}
                        </span>
                        <div className="h-2.5 overflow-hidden rounded-full bg-subtle">
                          <div
                            className={cn("h-full rounded-full", busiest ? "bg-text-primary" : "bg-accent")}
                            style={{ width: `${day.miles ? Math.max(3, (day.miles / maxWeekdayMiles) * 100) : 0}%` }}
                          />
                        </div>
                        <span className={cn("text-right text-[11px]", busiest ? "font-medium text-text-primary" : "text-text-secondary")}>
                          {day.miles.toFixed(1)} mi
                        </span>
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="rounded-[24px] border border-border bg-surface p-5 shadow-card sm:p-6">
                <h2 className="text-[18px] font-medium text-text-primary">Top areas driven to</h2>
                <p className="mt-1 text-[12px] text-text-tertiary">Destinations receiving the most business mileage</p>
                <div className="mt-5 space-y-4">
                  {areaData.slice(0, 6).map((area, index) => (
                    <div key={area.area}>
                      <div className="flex items-center gap-3">
                        <span className="w-4 text-[11px] font-medium text-text-tertiary">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-text-primary">{area.area}</span>
                        <span className="text-[11px] text-text-secondary">{area.miles.toFixed(1)} mi</span>
                      </div>
                      <div className="ml-7 mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle">
                        <div
                          className="h-full rounded-full bg-[#D8C7A5]"
                          style={{ width: `${Math.max(3, (area.miles / maxAreaMiles) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {!areaData.length ? <p className="py-8 text-center text-[12px] text-text-tertiary">No destinations yet.</p> : null}
                </div>
              </article>
            </section>

            <section className="rounded-[24px] border border-border bg-surface p-5 shadow-card sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-[18px] font-medium text-text-primary">
                    Drives · {Math.min(visibleDriveCount, listTrips.length)} of {periodTrips.length}
                  </h2>
                  <p className="mt-1 text-[12px] text-text-tertiary">Business drives in {periodLabel}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {([
                    ["all", "All"],
                    ["short", "Short (<2mi)"],
                    ["long", "Long (>10mi)"]
                  ] as Array<[DriveFilter, string]>).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      className="min-h-9 px-3 text-[13px]"
                      variant={driveFilter === value ? "primary" : "soft"}
                      onClick={() => setDriveFilter(value)}
                    >
                      {label}
                    </Button>
                  ))}
                  <Button className="min-h-9 px-3 text-[13px]" variant="ghost" onClick={() => setAdvanced(!advanced)}>
                    <SlidersHorizontal size={14} />
                    Advanced filters
                    {advanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </Button>
                </div>
              </div>

              <div className="collapsible-grid mt-4" data-open={advanced}>
                <div>
                  <div className="grid gap-3 rounded-[18px] bg-subtle p-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Input label="Min miles" type="number" min="0" value={minMiles} onChange={(e) => setMinMiles(e.target.value)} />
                    <Input label="Max miles" type="number" min="0" value={maxMiles} onChange={(e) => setMaxMiles(e.target.value)} />
                    <Select label="Destination area" value={destination} onChange={(e) => setDestination(e.target.value)}>
                      <option value="">All areas</option>
                      {destinationOptions.map((area) => (
                        <option key={area} value={area}>
                          {area}
                        </option>
                      ))}
                    </Select>
                    <Input label="From time" type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} />
                    <Input label="To time" type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} />
                  </div>
                </div>
              </div>

              {listTrips.length ? (
                <div className="mt-5 divide-y divide-border">
                  {listTrips.slice(0, visibleDriveCount).map((trip) => {
                    const date = dateFromTimestamp(trip.start_at);
                    return (
                      <div
                        key={trip.id}
                        className="grid grid-cols-[56px_34px_minmax(0,1fr)_64px_78px] items-center gap-2 py-3.5 text-[12px] sm:grid-cols-[76px_42px_minmax(0,1fr)_80px_92px]"
                      >
                        <span className="font-medium text-text-primary">
                          {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)}
                        </span>
                        <span className="text-text-tertiary">{WEEKDAYS[date.getDay()].slice(0, 3)}</span>
                        <span className="flex min-w-0 items-center gap-2 text-text-secondary">
                          <ArrowRight size={14} className="shrink-0 text-accent" />
                          <span className="truncate">{destinationArea(trip.stop_location)}</span>
                        </span>
                        <span className="text-right font-medium text-text-primary">{Number(trip.miles).toFixed(1)} mi</span>
                        <span className="text-right font-medium text-success">{formatCurrency(trip.deduction_value)}</span>
                      </div>
                    );
                  })}
                  {visibleDriveCount < listTrips.length ? (
                    <div className="pt-4 text-center">
                      <Button
                        className="min-h-10 px-3 text-[14px]"
                        variant="soft"
                        onClick={() => setVisibleDriveCount((count) => count + 12)}
                      >
                        Show more
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl bg-subtle py-10 text-center text-[13px] text-text-secondary">
                  No drives match these filters.
                </div>
              )}
            </section>

            <MileageHistory uploads={uploads} restoringId={restoringId} onRestore={restore} />
          </>
        )}
      </div>

      <MileageUploader
        userId={user.id}
        uploads={uploads}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSaved={flash}
      />
      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}

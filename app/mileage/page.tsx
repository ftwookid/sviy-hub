"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Settings2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { MileageHistory } from "@/components/MileageHistory";
import { MileageUploader } from "@/components/MileageUploader";
import { SectionTabs } from "@/components/SectionTabs";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import {
  dateFromTimestamp,
  dateKey,
  daysBetween,
  loadMileageTrips,
  loadMileageUploads,
  monthLabel,
  monthsBetween,
  shortMonth,
  totalsFor
} from "@/lib/mileage";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import { labelFor, loadUsers, type UserOption } from "@/lib/userLabels";
import { carEconomics, normalizeCostKind } from "@/lib/vehicle";
import type { MileageTrip, MileageUpload } from "@/types/mileage";
import type { VehicleCost, VehicleProfile } from "@/types/vehicle";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

type Period = "month" | "year" | "all";

/** The books for the car start here; everything before it predates the tracking. */
const CAR_EPOCH = "2026-01-01";

function centsPerMile(value: number) {
  return `${(value * 100).toFixed(1)}¢`;
}

/** Bar labels have one line to fit in, so money is rounded and k-suffixed. */
function compactMoney(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

/**
 * A cell in a strip, not a card. Seven of these each carrying their own border,
 * shadow and padding is seven times the chrome for the same seven numbers — and
 * a reserved-but-empty detail line under each one is pure wasted viewport.
 */
function Stat({
  label,
  value,
  detail,
  tone
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="min-w-0 px-3 py-2.5 first:pl-0 last:pr-0">
      <div className="truncate text-caption font-medium uppercase tracking-[0.05em] text-text-tertiary">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-figure font-semibold leading-none tracking-[-0.01em]",
          tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-text-primary"
        )}
      >
        {value}
      </div>
      {detail ? <div className="mt-1 truncate text-meta text-text-tertiary">{detail}</div> : null}
    </div>
  );
}

function StatStrip({
  children,
  columns,
  bare
}: {
  children: React.ReactNode;
  columns: string;
  bare?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid divide-x divide-border px-3",
        columns,
        bare ? "mt-1" : "rounded-[16px] border border-border bg-surface"
      )}
    >
      {children}
    </div>
  );
}

export default function MileagePage() {
  const now = useMemo(() => new Date(), []);
  const { user, isAdmin, authLoading } = useAuthUser();
  const [uploads, setUploads] = useState<MileageUpload[]>([]);
  const [trips, setTrips] = useState<MileageTrip[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<UserOption[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");
  const [carError, setCarError] = useState("");
  const [toast, setToast] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("year");
  const [selectedMonth, setSelectedMonth] = useState(dateKey(new Date(now.getFullYear(), now.getMonth(), 1)).slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [showHistory, setShowHistory] = useState(false);
  const [restoringId, setRestoringId] = useState("");
  const [changingOwnerId, setChangingOwnerId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [costs, setCosts] = useState<VehicleCost[]>([]);

  const ownerLabels = useMemo(
    () => Object.fromEntries(ownerOptions.map((owner) => [owner.id, owner.label])),
    [ownerOptions]
  );

  const importOwnerId = selectedOwnerId !== "all" ? selectedOwnerId : user?.id ?? "";
  const importOwnerLabel = ownerLabels[importOwnerId] ?? "your account";


  useEffect(() => {
    let active = true;
    loadUsers().then((users) => {
      if (active) setOwnerOptions(users);
    });
    return () => {
      active = false;
    };
  }, []);

  const loadDriving = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setSchemaError("");

    const { uploads: nextUploads, error: uploadError } = await loadMileageUploads({ ownerId: selectedOwnerId });
    if (uploadError) {
      setSchemaError(uploadError.message);
      setLoading(false);
      return;
    }

    const active = nextUploads.filter((upload) => upload.is_active);
    const { trips: nextTrips, error: tripError } = await loadMileageTrips(
      { ownerId: selectedOwnerId },
      active.map((upload) => upload.id)
    );
    if (tripError) {
      setSchemaError(tripError.message);
      setLoading(false);
      return;
    }

    if (active.length) {
      const latestMonth = active[0].period_month.slice(0, 7);
      const months = new Set(active.map((upload) => upload.period_month.slice(0, 7)));
      const years = new Set(active.map((upload) => Number(upload.period_month.slice(0, 4))));
      setSelectedMonth((current) => (months.has(current) ? current : latestMonth));
      setSelectedYear((current) => (years.has(current) ? current : Number(latestMonth.slice(0, 4))));
    }

    setUploads(nextUploads);
    setTrips(nextTrips);
    setLoading(false);
  }, [selectedOwnerId, user]);

  useEffect(() => {
    loadDriving();
  }, [loadDriving]);

  const loadCar = useCallback(async () => {
    if (!supabase) return;
    setCarError("");

    const [{ data: profileData, error: profileError }, { data: costData, error: costError }] = await Promise.all([
      supabase.from("vehicle_profiles").select("*").order("updated_at", { ascending: false }).limit(1),
      supabase.from("vehicle_costs").select("*").order("incurred_on", { ascending: false })
    ]);

    if (profileError || costError) {
      setCarError((profileError ?? costError)!.message);
      return;
    }

    setProfile((((profileData ?? []) as VehicleProfile[])[0] ?? null) as VehicleProfile | null);
    setCosts(((costData ?? []) as VehicleCost[]).map((cost) => ({ ...cost, kind: normalizeCostKind(cost.kind) })));
  }, []);

  useEffect(() => {
    loadCar();
  }, [loadCar]);

  const availableMonths = useMemo(
    () =>
      Array.from(new Set(uploads.filter((u) => u.is_active).map((u) => u.period_month.slice(0, 7)))).sort((a, b) =>
        b.localeCompare(a)
      ),
    [uploads]
  );

  const availableYears = useMemo(() => {
    const values = Array.from(new Set(uploads.filter((u) => u.is_active).map((u) => Number(u.period_month.slice(0, 4)))));
    if (!values.includes(now.getFullYear())) values.push(now.getFullYear());
    return values.sort((a, b) => b - a);
  }, [now, uploads]);

  const inPeriod = useCallback(
    (isoDate: string) => {
      if (period === "month") return isoDate.slice(0, 7) === selectedMonth;
      if (period === "year") return Number(isoDate.slice(0, 4)) === selectedYear;
      return true;
    },
    [period, selectedMonth, selectedYear]
  );

  const periodTrips = useMemo(() => trips.filter((trip) => inPeriod(trip.start_at)), [inPeriod, trips]);

  const periodBounds = useMemo(() => {
    if (period === "month") {
      const [year, month] = selectedMonth.split("-").map(Number);
      return { start: new Date(year, month - 1, 1), end: new Date(year, month, 0) };
    }
    if (period === "year") return { start: new Date(selectedYear, 0, 1), end: new Date(selectedYear, 11, 31) };
    if (periodTrips.length) {
      const stamps = periodTrips.map((trip) => dateFromTimestamp(trip.start_at).getTime());
      return { start: new Date(Math.min(...stamps)), end: new Date(Math.max(...stamps)) };
    }
    return { start: now, end: now };
  }, [now, period, periodTrips, selectedMonth, selectedYear]);

  const periodName = period === "month" ? monthLabel(selectedMonth) : period === "year" ? String(selectedYear) : "All time";
  const totals = totalsFor(periodTrips);
  const averageTrip = totals.trips ? totals.miles / totals.trips : 0;

  const weekdayData = useMemo(() => {
    const rows = MONDAY_FIRST.map((index) => {
      const matching = periodTrips.filter((trip) => dateFromTimestamp(trip.start_at).getDay() === index);
      return {
        index,
        label: WEEKDAYS[index],
        miles: matching.reduce((sum, trip) => sum + Number(trip.miles), 0),
        money: matching.reduce((sum, trip) => sum + Number(trip.deduction_value), 0),
        trips: matching.length
      };
    });
    const busiest = rows.slice().sort((a, b) => b.miles - a.miles)[0];
    return { rows, busiestIndex: busiest?.miles ? busiest.index : -1 };
  }, [periodTrips]);
  const maxWeekdayMiles = Math.max(...weekdayData.rows.map((row) => row.miles), 1);

  const chartData = useMemo(() => {
    const milesByKey = new Map<string, number>();
    const moneyByKey = new Map<string, number>();
    periodTrips.forEach((trip) => {
      const key = period === "month" ? trip.start_at.slice(0, 10) : trip.start_at.slice(0, 7);
      milesByKey.set(key, (milesByKey.get(key) ?? 0) + Number(trip.miles));
      moneyByKey.set(key, (moneyByKey.get(key) ?? 0) + Number(trip.deduction_value));
    });

    if (period === "month") {
      return daysBetween(periodBounds.start, periodBounds.end).map((date) => {
        const key = dateKey(date);
        return {
          key,
          axisLabel: String(date.getDate()),
          miles: milesByKey.get(key) ?? 0,
          money: moneyByKey.get(key) ?? 0
        };
      });
    }

    return monthsBetween(periodBounds.start, periodBounds.end).map((date) => {
      const key = dateKey(date).slice(0, 7);
      return {
        key,
        axisLabel: period === "all" ? `${shortMonth(date)} ’${String(date.getFullYear()).slice(2)}` : shortMonth(date),
        miles: milesByKey.get(key) ?? 0,
        money: moneyByKey.get(key) ?? 0
      };
    });
  }, [period, periodBounds.end, periodBounds.start, periodTrips]);

  const maxChartMiles = Math.max(...chartData.map((item) => item.miles), 1);

  /**
   * Every trip, whoever drove it, and regardless of the driver filter above.
   *
   * The car's costs are one shared ledger that cannot be split per driver, so
   * dividing them by one person's miles produced nonsense — "the car takes
   * 1039% of the deduction" when it was really taking a fraction of the
   * household's. Shared costs have to meet shared miles.
   */
  const carTripPool = trips;

  const mpg = profile?.mpg != null ? Number(profile.mpg) : null;
  const fuelPrice = profile?.fuel_price != null ? Number(profile.fuel_price) : null;
  const configured = Boolean(mpg && fuelPrice);

  /** One window of driving priced up, so the same sum serves any span. */
  const statsForWindow = useCallback(
    (matches: (isoDate: string) => boolean) => {
      const windowTrips = carTripPool.filter((trip) => matches(trip.start_at));
      const totals = totalsFor(windowTrips);
      return carEconomics({
        miles: totals.miles,
        deduction: totals.deduction,
        mpg,
        fuelPrice,
        costs: costs.filter((cost) => matches(cost.incurred_on))
      });
    },
    [carTripPool, costs, fuelPrice, mpg]
  );

  /**
   * The running total, from the first day the car has been tracked rather than
   * from whatever the period selector says. What the driving has deducted
   * against what the car has swallowed is a cumulative question — a single
   * month of it would swing on one repair bill.
   */
  const sinceEpoch = useMemo(() => statsForWindow((iso) => iso.slice(0, 10) >= CAR_EPOCH), [statsForWindow]);
  const epochYear = CAR_EPOCH.slice(0, 4);
  const spendShare = sinceEpoch.deduction ? sinceEpoch.totalCost / sinceEpoch.deduction : 0;
  /** Deduction minus what the car took. Negative is money out of pocket. */
  const carBalance = sinceEpoch.deduction - sinceEpoch.totalCost;

  /** What the total is made of, so it never has to be added up in the head. */
  const carBreakdown = useMemo(() => {
    const byKind = new Map<string, number>();
    costs
      .filter((cost) => cost.incurred_on >= CAR_EPOCH && cost.kind !== "Fuel")
      .forEach((cost) => byKind.set(cost.kind, (byKind.get(cost.kind) ?? 0) + Number(cost.amount)));

    return [
      ...(sinceEpoch.fuelCost > 0 ? [{ label: "Fuel", amount: sinceEpoch.fuelCost }] : []),
      ...Array.from(byKind.entries())
        .map(([label, amount]) => ({ label, amount }))
        .sort((a, b) => b.amount - a.amount)
    ];
  }, [costs, sinceEpoch.fuelCost]);

  /** Cost per mile month by month, over the twelve months ending this period. */
  const costTrend = useMemo(() => {
    if (!configured) return [];
    const last = periodBounds.end;
    const first = new Date(last.getFullYear(), last.getMonth() - 11, 1);
    return monthsBetween(first, last).map((date) => {
      const key = dateKey(date).slice(0, 7);
      const stats = statsForWindow((iso) => iso.slice(0, 7) === key);
      return {
        key,
        axisLabel: shortMonth(date),
        costPerMile: stats.costPerMile,
        miles: stats.miles
      };
    });
  }, [configured, periodBounds.end, statsForWindow]);

  const trendCeiling = Math.max(...costTrend.map((point) => point.costPerMile), 0.01);

  function flash(message: string, focusMonth?: string) {
    if (focusMonth) {
      const month = focusMonth.slice(0, 7);
      setPeriod("month");
      setSelectedMonth(month);
      setSelectedYear(Number(month.slice(0, 4)));
    }
    setToast(message);
    loadDriving();
    window.setTimeout(() => setToast(""), 2600);
  }




  async function restore(upload: MileageUpload) {
    if (!supabase || !user) return;
    const label = monthLabel(upload.period_month.slice(0, 7));
    if (!window.confirm(`Restore this ${label} version? It becomes the version every total is built from.`)) return;

    setRestoringId(upload.id);
    const current = uploads.find(
      (item) => item.user_id === upload.user_id && item.period_month === upload.period_month && item.is_active
    );
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

  /**
   * Removes one imported version. Trips cascade with it.
   *
   * If the version being removed is the live one and others survive, the newest
   * survivor is promoted — a month must never be left with rows in the table
   * and nothing marked active, which would silently drop it from every total.
   */
  async function deleteUpload(upload: MileageUpload, siblings: MileageUpload[]) {
    if (!supabase) return;
    const label = monthLabel(upload.period_month.slice(0, 7));
    const others = siblings.filter((item) => item.id !== upload.id);
    const message = others.length
      ? `Delete this ${label} import? Its ${upload.business_trip_count} trips go with it.`
      : `Delete ${label} entirely? Its ${upload.business_trip_count} trips go with it and the month leaves every total.`;
    if (!window.confirm(message)) return;

    setDeletingId(upload.id);
    const { error } = await supabase.from("mileage_uploads").delete().eq("id", upload.id);
    if (error) {
      window.alert(error.message);
      setDeletingId("");
      return;
    }

    if (upload.is_active && others.length) {
      const successor = others
        .slice()
        .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0];
      await supabase
        .from("mileage_uploads")
        .update({ is_active: true, activated_at: new Date().toISOString() })
        .eq("id", successor.id);
    }

    setDeletingId("");
    flash(`${label} import deleted`);
  }

  async function changeUploadOwner(upload: MileageUpload, nextOwnerId: string) {
    if (!supabase || nextOwnerId === upload.user_id) return;
    const label = monthLabel(upload.period_month.slice(0, 7));
    const nextOwnerLabel = labelFor(ownerLabels, nextOwnerId);
    if (!window.confirm(`Move ${label} mileage to ${nextOwnerLabel}?`)) return;

    setChangingOwnerId(upload.id);
    const { error: uploadError } = await supabase
      .from("mileage_uploads")
      .update({ user_id: nextOwnerId })
      .eq("id", upload.id);
    if (uploadError) {
      window.alert(uploadError.message);
      setChangingOwnerId("");
      return;
    }

    const { error: tripsError } = await supabase
      .from("mileage_trips")
      .update({ user_id: nextOwnerId })
      .eq("upload_id", upload.id);
    if (tripsError) {
      await supabase.from("mileage_uploads").update({ user_id: upload.user_id }).eq("id", upload.id);
      window.alert(tripsError.message);
      setChangingOwnerId("");
      return;
    }

    setChangingOwnerId("");
    flash(`${label} moved to ${nextOwnerLabel}`);
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  const selectClass =
    "focus-ring h-11 rounded-xl border border-border bg-surface px-3 text-label font-medium text-text-primary shadow-sm";
  const inputClass =
    "focus-ring h-11 w-full rounded-xl border border-border bg-subtle px-3 text-label text-text-primary placeholder:text-text-tertiary";
  const compactInput =
    "focus-ring mt-0.5 h-8 w-full rounded-lg border border-border bg-subtle px-2 text-body text-text-primary placeholder:text-text-tertiary";

  return (
    <AppShell user={user}>
      <PageHeader title="Taxes" />
      <div className="space-y-2.5">
        <SectionTabs />

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-grid h-11 shrink-0 grid-cols-3 rounded-xl border border-border bg-subtle p-0.5">
            {(["month", "year", "all"] as Period[]).map((value) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "focus-ring min-w-[64px] rounded-[10px] px-3 text-list font-medium transition duration-150 ease-out",
                  period === value ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary"
                )}
                onClick={() => setPeriod(value)}
              >
                {value === "all" ? "All time" : value === "month" ? "Month" : "Year"}
              </button>
            ))}
          </div>

          {period === "month" ? (
            <select
              aria-label="Month"
              className={cn(selectClass, "min-w-0 flex-1 sm:max-w-[190px]")}
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            >
              {(availableMonths.length ? availableMonths : [selectedMonth]).map((month) => (
                <option key={month} value={month}>
                  {monthLabel(month)}
                </option>
              ))}
            </select>
          ) : period === "year" ? (
            <select
              aria-label="Year"
              className={cn(selectClass, "min-w-0 flex-1 sm:max-w-[120px]")}
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          ) : null}

          {ownerOptions.length > 1 ? (
            <select
              aria-label="Driver"
              className={cn(selectClass, "min-w-0 flex-1 sm:max-w-[160px]")}
              value={selectedOwnerId}
              onChange={(event) => setSelectedOwnerId(event.target.value)}
            >
              <option value="all">Everyone</option>
              {ownerOptions.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.label}
                </option>
              ))}
            </select>
          ) : null}

          <Button className="ml-auto shrink-0" variant="accent" onClick={() => setImportOpen(true)}>
            <Plus size={18} strokeWidth={1.6} />
            Import
          </Button>
        </div>

        {schemaError ? (
          <section className="rounded-[20px] border border-warning/20 bg-warning-soft p-4">
            <p className="text-list text-text-secondary">
              Run <code className="rounded bg-white/70 px-1.5 py-0.5">supabase/mileage-schema.sql</code> in Supabase,
              then refresh.
            </p>
            <p className="mt-2 text-caption text-warning">{schemaError}</p>
          </section>
        ) : null}

        {loading ? (
          <SkeletonRows />
        ) : (
          <>
            <StatStrip columns="grid-cols-3">
              <Stat
                label="Miles"
                value={totals.miles.toFixed(1)}
                detail={`${totals.trips} drive${totals.trips === 1 ? "" : "s"}`}
              />
              <Stat
                label="Deduction"
                value={formatCurrency(totals.deduction)}
                detail={totals.ratePerMile ? `${(totals.ratePerMile * 100).toFixed(1)}¢/mi` : undefined}
              />
              <Stat
                label="Average drive"
                value={`${averageTrip.toFixed(1)} mi`}
                detail={weekdayData.busiestIndex >= 0 ? `busiest ${WEEKDAYS[weekdayData.busiestIndex].slice(0, 3)}` : undefined}
              />
            </StatStrip>

            <section className="rounded-[16px] border border-border bg-surface">
              <h2 className="px-3 pt-3 text-body font-semibold leading-tight text-text-primary">
                {period === "month" ? "Daily" : "Monthly"} · {periodName}
              </h2>

              {/* Miles size the bar; the deduction those miles earned sits under
                  it. Both at once — they are one fact read two ways, and a
                  toggle made you click to compare them. */}
              <div className="mt-3 overflow-x-auto px-3 pb-6">
                <div
                  className="grid h-36 items-end gap-1.5 border-b border-border"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(chartData.length, 1)}, minmax(0, 1fr))`,
                    minWidth:
                      period === "month" ? "820px" : period === "all" ? `${Math.max(100, chartData.length * 60)}px` : "100%"
                  }}
                >
                  {chartData.map((item) => (
                    <div key={item.key} className="relative flex h-full min-w-0 flex-col justify-end">
                      <span
                        className={cn(
                          "mb-0.5 text-center text-micro leading-tight",
                          item.miles ? "text-text-secondary" : "text-transparent"
                        )}
                      >
                        {item.miles.toFixed(0)}
                      </span>
                      <span
                        className={cn(
                          "mb-1 text-center text-micro leading-tight",
                          item.money ? "text-accent" : "text-transparent"
                        )}
                      >
                        {compactMoney(item.money)}
                      </span>
                      <div
                        className={cn("w-full rounded-t-[4px]", item.miles ? "bg-accent" : "bg-subtle")}
                        style={{ height: item.miles ? `max(5px, ${(item.miles / maxChartMiles) * 82}%)` : "2px" }}
                      />
                      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-micro text-text-tertiary">
                        {item.axisLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-border px-3 py-3">
                <h3 className="text-list font-semibold text-text-primary">By weekday</h3>
                <div className="mt-2.5 space-y-2">
                  {weekdayData.rows.map((day) => {
                    const busiest = day.index === weekdayData.busiestIndex;
                    return (
                      <div key={day.label} className="grid grid-cols-[38px_1fr_66px_66px] items-center gap-3">
                        <span
                          className={cn("text-meta", busiest ? "font-medium text-text-primary" : "text-text-secondary")}
                        >
                          {day.label.slice(0, 3)}
                        </span>
                        <div className="h-2.5 overflow-hidden rounded-full bg-subtle">
                          <div
                            className={cn("h-full rounded-full", busiest ? "bg-text-primary" : "bg-accent")}
                            style={{ width: `${day.miles ? Math.max(3, (day.miles / maxWeekdayMiles) * 100) : 0}%` }}
                          />
                        </div>
                        <span
                          className={cn(
                            "text-right text-meta",
                            busiest ? "font-medium text-text-primary" : "text-text-secondary"
                          )}
                        >
                          {day.miles.toFixed(1)} mi
                        </span>
                        <span className="text-right text-meta text-text-tertiary">{formatCurrency(day.money)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {carError ? (
              <section className="rounded-[16px] border border-warning/20 bg-warning-soft p-3">
                <p className="text-list text-text-secondary">
                  Run <code className="rounded bg-white/70 px-1.5 py-0.5">supabase/vehicle-schema.sql</code> in
                  Supabase, then refresh.
                </p>
                <p className="mt-1.5 text-caption text-warning">{carError}</p>
              </section>
            ) : null}

            <section className="rounded-[16px] border border-border bg-surface">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 pt-3">
                <h2 className="text-body font-semibold leading-tight text-text-primary">
                  The car · since Jan 1 {epochYear}
                </h2>
                {/* Entering the car's numbers still belongs in Profile — it is setup,
                    done a few times a year — but this is the page where you notice
                    they need entering, so the way there is named here rather than
                    left to be found. */}
                {isAdmin ? (
                  <Link
                    href="/profile#car-settings"
                    className="focus-ring inline-flex items-center gap-1 rounded-lg px-1 text-meta font-medium text-text-secondary transition hover:text-text-primary"
                  >
                    <Settings2 size={14} strokeWidth={1.7} />
                    {configured ? "Edit car data" : "Add car data"}
                  </Link>
                ) : (
                  <span className="text-meta text-text-tertiary">
                    Fuel economy, pump price and car costs are set in Profile.
                  </span>
                )}
              </div>

              <StatStrip columns="grid-cols-3" bare>
                <Stat
                  label="Deducted"
                  value={formatCurrency(sinceEpoch.deduction)}
                  detail={`${sinceEpoch.miles.toFixed(0)} mi`}
                />
                <Stat
                  label="Spent on the car"
                  value={formatCurrency(sinceEpoch.totalCost)}
                  detail={sinceEpoch.deduction ? `${Math.round(spendShare * 100)}% of it` : undefined}
                />
                <Stat
                  label={carBalance < 0 ? "Out of pocket" : "Left over"}
                  value={`${carBalance < 0 ? "−" : "+"}${formatCurrency(Math.abs(carBalance))}`}
                  tone={carBalance < 0 ? "bad" : "good"}
                />
              </StatStrip>

              {carBreakdown.length ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 pb-2 text-meta text-text-tertiary">
                  {carBreakdown.map((row) => (
                    <span key={row.label}>
                      {row.label} <span className="text-text-secondary">{formatCurrency(row.amount)}</span>
                    </span>
                  ))}
                </div>
              ) : null}

              {sinceEpoch.deduction ? (
                <div className="px-3 pb-3">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-subtle">
                    <div
                      className={cn("h-full", carBalance < 0 ? "bg-danger" : "bg-accent")}
                      style={{ width: `${Math.min(100, spendShare * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {configured && costTrend.length ? (
                <div className="border-t border-border px-3 py-3">
                  <h3 className="text-list font-semibold text-text-primary">Cost per mile · 12 months</h3>
                  <div className="mt-2.5 overflow-x-auto pb-5">
                    <div
                      className="grid h-28 items-end gap-1.5 border-b border-border"
                      style={{
                        gridTemplateColumns: `repeat(${costTrend.length}, minmax(0, 1fr))`,
                        minWidth: "100%"
                      }}
                    >
                      {costTrend.map((point) => (
                        <div key={point.key} className="relative flex h-full min-w-0 flex-col justify-end">
                          <span
                            className={cn(
                              "mb-1 text-center text-micro",
                              point.miles ? "text-text-tertiary" : "text-transparent"
                            )}
                          >
                            {point.miles ? `${(point.costPerMile * 100).toFixed(0)}¢` : "0"}
                          </span>
                          <div
                            className={cn("w-full rounded-t-[4px]", point.miles ? "bg-accent" : "bg-subtle")}
                            style={{
                              height: point.miles ? `max(5px, ${(point.costPerMile / trendCeiling) * 90}%)` : "2px"
                            }}
                          />
                          <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-micro text-text-tertiary">
                            {point.axisLabel}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            <div>
              <button
                type="button"
                className="focus-ring w-full rounded-[16px] border border-border bg-surface px-3 py-2.5 text-left text-list font-medium text-text-secondary hover:text-text-primary"
                onClick={() => setShowHistory(!showHistory)}
              >
                {showHistory ? "Hide imported months" : "Imported months"}
              </button>
              {showHistory ? (
                <div className="mt-3">
                  <MileageHistory
                    uploads={uploads}
                    restoringId={restoringId}
                    changingOwnerId={changingOwnerId}
                    ownerLabels={ownerLabels}
                    ownerOptions={ownerOptions}
                    canChangeOwner
                    deletingId={deletingId}
                    onRestore={restore}
                    onChangeOwner={changeUploadOwner}
                    onDelete={deleteUpload}
                  />
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      <MileageUploader
        userId={importOwnerId}
        ownerLabel={importOwnerLabel}
        uploads={uploads.filter((upload) => upload.user_id === importOwnerId)}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSaved={flash}
      />
      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}

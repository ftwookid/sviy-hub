"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MileageHistory } from "@/components/MileageHistory";
import { MileageUploader } from "@/components/MileageUploader";
import { SectionTabs } from "@/components/SectionTabs";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatCurrency, todayInputValue } from "@/lib/formatters";
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
import { carEconomics, normalizeCostKind, savingsAtMpg } from "@/lib/vehicle";
import type { MileageTrip, MileageUpload } from "@/types/mileage";
import { VEHICLE_COST_KINDS } from "@/types/vehicle";
import type { VehicleCost, VehicleCostKind, VehicleProfile } from "@/types/vehicle";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

type Period = "month" | "year" | "all";
type ChartUnit = "miles" | "money";

function centsPerMile(value: number) {
  return `${(value * 100).toFixed(1)}¢`;
}

/** Bar labels have one line to fit in, so money is rounded and k-suffixed. */
function compactMoney(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

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
    <div className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">{label}</div>
      <div
        className={cn(
          "mt-2.5 text-[24px] font-medium leading-none tracking-[-0.01em]",
          tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-text-primary"
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 h-4 text-[12px] text-text-tertiary">{detail ?? ""}</div>
    </div>
  );
}

export default function DrivingPage() {
  const now = useMemo(() => new Date(), []);
  const { user, authLoading } = useAuthUser();
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
  const [chartUnit, setChartUnit] = useState<ChartUnit>("miles");
  const [showHistory, setShowHistory] = useState(false);
  const [restoringId, setRestoringId] = useState("");
  const [changingOwnerId, setChangingOwnerId] = useState("");

  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [costs, setCosts] = useState<VehicleCost[]>([]);
  const [mpgInput, setMpgInput] = useState("");
  const [fuelPriceInput, setFuelPriceInput] = useState("");
  const [targetMpg, setTargetMpg] = useState("");
  const [costDate, setCostDate] = useState(todayInputValue());
  const [costKind, setCostKind] = useState<VehicleCostKind>("Repair");
  const [costAmount, setCostAmount] = useState("");
  const [costNote, setCostNote] = useState("");
  const [savingCost, setSavingCost] = useState(false);

  const ownerLabels = useMemo(
    () => Object.fromEntries(ownerOptions.map((owner) => [owner.id, owner.label])),
    [ownerOptions]
  );

  const importOwnerId = selectedOwnerId !== "all" ? selectedOwnerId : user?.id ?? "";
  const importOwnerLabel = ownerLabels[importOwnerId] ?? "your account";

  // A car belongs to one person, so "Everyone" cannot ask what it costs. The
  // signed-in user's own car is the sensible thing to show, named so it is
  // never mistaken for a household total.
  const carOwnerId = selectedOwnerId !== "all" ? selectedOwnerId : user?.id ?? "";

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
    if (!supabase || !carOwnerId) return;
    setCarError("");

    const [{ data: profileData, error: profileError }, { data: costData, error: costError }] = await Promise.all([
      supabase.from("vehicle_profiles").select("*").eq("user_id", carOwnerId).maybeSingle(),
      supabase.from("vehicle_costs").select("*").eq("user_id", carOwnerId).order("incurred_on", { ascending: false })
    ]);

    if (profileError || costError) {
      setCarError((profileError ?? costError)!.message);
      return;
    }

    const nextProfile = (profileData ?? null) as VehicleProfile | null;
    setProfile(nextProfile);
    setMpgInput(nextProfile?.mpg != null ? String(nextProfile.mpg) : "");
    setFuelPriceInput(nextProfile?.fuel_price != null ? String(nextProfile.fuel_price) : "");
    setCosts(((costData ?? []) as VehicleCost[]).map((cost) => ({ ...cost, kind: normalizeCostKind(cost.kind) })));
  }, [carOwnerId]);

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

  const maxChartValue = Math.max(...chartData.map((item) => item[chartUnit]), chartUnit === "money" ? 0.01 : 1);

  // The car is one person's, so it is measured against that person's miles even
  // when the page is showing everyone's.
  const carTrips = useMemo(
    () => (selectedOwnerId === "all" ? periodTrips.filter((trip) => trip.user_id === carOwnerId) : periodTrips),
    [carOwnerId, periodTrips, selectedOwnerId]
  );
  const carTotals = totalsFor(carTrips);
  const periodCosts = useMemo(() => costs.filter((cost) => inPeriod(cost.incurred_on)), [costs, inPeriod]);

  const mpg = profile?.mpg != null ? Number(profile.mpg) : null;
  const fuelPrice = profile?.fuel_price != null ? Number(profile.fuel_price) : null;
  const economics = useMemo(
    () =>
      carEconomics({
        miles: carTotals.miles,
        deduction: carTotals.deduction,
        mpg,
        fuelPrice,
        costs: periodCosts
      }),
    [carTotals.deduction, carTotals.miles, fuelPrice, mpg, periodCosts]
  );
  const configured = Boolean(mpg && fuelPrice);
  const whatIf = useMemo(
    () => savingsAtMpg({ miles: carTotals.miles, fuelPrice, currentMpg: mpg, targetMpg: Number(targetMpg) }),
    [carTotals.miles, fuelPrice, mpg, targetMpg]
  );

  const byKind = useMemo(() => {
    const rows = VEHICLE_COST_KINDS.filter((kind) => kind !== "Fuel")
      .map((kind) => ({
        kind: kind as VehicleCostKind,
        amount: periodCosts.filter((cost) => cost.kind === kind).reduce((sum, cost) => sum + Number(cost.amount), 0)
      }))
      .filter((row) => row.amount > 0);
    if (economics.fuelCost > 0) rows.unshift({ kind: "Fuel" as VehicleCostKind, amount: economics.fuelCost });
    return rows;
  }, [economics.fuelCost, periodCosts]);
  const maxKind = Math.max(...byKind.map((row) => row.amount), 1);

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

  async function saveProfile(next: { mpg?: string; fuel_price?: string }) {
    if (!supabase || !carOwnerId) return;
    const { error } = await supabase.from("vehicle_profiles").upsert(
      {
        user_id: carOwnerId,
        mpg: next.mpg !== undefined ? (next.mpg === "" ? null : Number(next.mpg)) : mpg,
        fuel_price: next.fuel_price !== undefined ? (next.fuel_price === "" ? null : Number(next.fuel_price)) : fuelPrice,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );
    if (error) {
      setCarError(error.message);
      return;
    }
    loadCar();
  }

  async function addCost() {
    if (!supabase || !carOwnerId) return;
    const amount = Number(costAmount);
    if (!costDate || !amount) return;

    setSavingCost(true);
    const { error } = await supabase.from("vehicle_costs").insert({
      user_id: carOwnerId,
      incurred_on: costDate,
      kind: costKind,
      amount,
      note: costNote.trim() || null
    });
    setSavingCost(false);
    if (error) {
      setCarError(error.message);
      return;
    }
    setCostAmount("");
    setCostNote("");
    setToast("Cost added");
    window.setTimeout(() => setToast(""), 2400);
    loadCar();
  }

  async function removeCost(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from("vehicle_costs").delete().eq("id", id);
    if (error) {
      setCarError(error.message);
      return;
    }
    loadCar();
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
    "focus-ring h-11 rounded-xl border border-border bg-surface px-3 text-[15px] font-medium text-text-primary shadow-sm";
  const inputClass =
    "focus-ring h-11 w-full rounded-xl border border-border bg-subtle px-3 text-[15px] text-text-primary placeholder:text-text-tertiary";
  const carOwnerName = ownerLabels[carOwnerId] ?? "your";

  const verdict = !configured
    ? "Add fuel economy and pump price to see what a business mile actually costs."
    : !carTotals.miles
      ? `No miles for ${periodName}, so there is nothing to measure the car against.`
      : economics.netPerMile >= 0
        ? `Every business mile returns ${centsPerMile(economics.ratePerMile)} and costs ${centsPerMile(
            economics.costPerMile
          )}. The car covers itself by ${formatCurrency(economics.netTotal)} across ${carTotals.miles.toFixed(0)} miles.`
        : `Every business mile returns ${centsPerMile(economics.ratePerMile)} but costs ${centsPerMile(
            economics.costPerMile
          )}. Over ${carTotals.miles.toFixed(0)} miles that is ${formatCurrency(
            Math.abs(economics.netTotal)
          )} out of pocket.`;

  return (
    <AppShell user={user}>
      <div className="space-y-3">
        <SectionTabs />

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-grid h-11 shrink-0 grid-cols-3 rounded-xl border border-border bg-subtle p-0.5">
            {(["month", "year", "all"] as Period[]).map((value) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "focus-ring min-w-[64px] rounded-[10px] px-3 text-[13px] font-medium transition duration-150 ease-out",
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
            <p className="text-[13px] text-text-secondary">
              Run <code className="rounded bg-white/70 px-1.5 py-0.5">supabase/mileage-schema.sql</code> in Supabase,
              then refresh.
            </p>
            <p className="mt-2 text-[11px] text-warning">{schemaError}</p>
          </section>
        ) : null}

        {loading ? (
          <SkeletonRows />
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Stat
                label="Miles"
                value={totals.miles.toFixed(1)}
                detail={`${totals.trips} drive${totals.trips === 1 ? "" : "s"}`}
              />
              <Stat
                label="Deduction"
                value={formatCurrency(totals.deduction)}
                detail={totals.ratePerMile ? `${(totals.ratePerMile * 100).toFixed(1)}¢ per mile` : undefined}
              />
              <Stat label="Average drive" value={`${averageTrip.toFixed(1)} mi`} />
            </section>

            <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-medium leading-tight text-text-primary">
                  {period === "month" ? "Daily" : "Monthly"} · {periodName}
                </h2>
                <div className="inline-grid h-8 grid-cols-2 rounded-lg border border-border bg-subtle p-0.5">
                  {(["miles", "money"] as ChartUnit[]).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      className={cn(
                        "focus-ring min-w-[58px] rounded-[7px] px-2 text-[12px] font-medium transition duration-150 ease-out",
                        chartUnit === unit ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary"
                      )}
                      onClick={() => setChartUnit(unit)}
                    >
                      {unit === "miles" ? "Miles" : "Dollars"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5 overflow-x-auto pb-5">
                <div
                  className="grid h-44 items-end gap-1.5 border-b border-border"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(chartData.length, 1)}, minmax(0, 1fr))`,
                    minWidth:
                      period === "month" ? "760px" : period === "all" ? `${Math.max(100, chartData.length * 56)}px` : "100%"
                  }}
                >
                  {chartData.map((item) => {
                    const value = item[chartUnit];
                    return (
                      <div key={item.key} className="group relative flex h-full min-w-0 flex-col justify-end">
                        <span
                          className={cn("mb-1 text-center text-[10px]", value ? "text-text-tertiary" : "text-transparent")}
                        >
                          {chartUnit === "miles" ? value.toFixed(0) : compactMoney(value)}
                        </span>
                        <div
                          className={cn("w-full rounded-t-[5px]", value ? "bg-accent" : "bg-subtle")}
                          style={{ height: value ? `max(6px, ${(value / maxChartValue) * 88}%)` : "2px" }}
                        />
                        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[11px] text-text-tertiary">
                          {item.axisLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
              <h2 className="text-[15px] font-medium leading-tight text-text-primary">By weekday</h2>
              <div className="mt-3 space-y-2.5">
                {weekdayData.rows.map((day) => {
                  const busiest = day.index === weekdayData.busiestIndex;
                  return (
                    <div key={day.label} className="grid grid-cols-[38px_1fr_60px_66px] items-center gap-3">
                      <span
                        className={cn(
                          "text-[12px]",
                          busiest ? "font-medium text-text-primary" : "text-text-secondary"
                        )}
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
                          "text-right text-[12px]",
                          busiest ? "font-medium text-text-primary" : "text-text-secondary"
                        )}
                      >
                        {day.miles.toFixed(1)} mi
                      </span>
                      <span className="text-right text-[12px] text-text-tertiary">{formatCurrency(day.money)}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="pt-2">
              <h2 className="text-[15px] font-medium leading-tight text-text-primary">
                {selectedOwnerId === "all" ? `${carOwnerName}’s car` : "The car"} · {periodName}
              </h2>
            </div>

            {carError ? (
              <section className="rounded-[20px] border border-warning/20 bg-warning-soft p-4">
                <p className="text-[13px] text-text-secondary">
                  Run <code className="rounded bg-white/70 px-1.5 py-0.5">supabase/vehicle-schema.sql</code> in
                  Supabase, then refresh.
                </p>
                <p className="mt-2 text-[11px] text-warning">{carError}</p>
              </section>
            ) : null}

            <section
              className={cn(
                "rounded-[20px] border p-4 shadow-card",
                configured && carTotals.miles && economics.netPerMile < 0
                  ? "border-danger/20 bg-danger-soft"
                  : "border-border bg-[#F5EFE3]"
              )}
            >
              <p className="text-[15px] leading-relaxed text-text-primary">{verdict}</p>
            </section>

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label="Cost per mile"
                value={configured && carTotals.miles ? centsPerMile(economics.costPerMile) : "—"}
                detail={configured && carTotals.miles ? formatCurrency(economics.totalCost) : undefined}
              />
              <Stat
                label="Returned per mile"
                value={carTotals.miles ? centsPerMile(economics.ratePerMile) : "—"}
                detail={carTotals.miles ? formatCurrency(carTotals.deduction) : undefined}
              />
              <Stat
                label="Kept per mile"
                value={configured && carTotals.miles ? centsPerMile(economics.netPerMile) : "—"}
                tone={configured && carTotals.miles ? (economics.netPerMile >= 0 ? "good" : "bad") : undefined}
                detail={configured && carTotals.miles ? formatCurrency(economics.netTotal) : undefined}
              />
              <Stat
                label="Upkeep / 1,000 mi"
                value={carTotals.miles ? formatCurrency(economics.upkeepPerThousandMiles) : "—"}
                detail={economics.totalCost ? `${Math.round(economics.upkeepShare * 100)}% of running cost` : undefined}
              />
            </section>

            <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
                    Miles per gallon
                  </span>
                  <input
                    className={inputClass}
                    type="number"
                    step="0.1"
                    min="0"
                    inputMode="decimal"
                    placeholder="26"
                    value={mpgInput}
                    onChange={(event) => setMpgInput(event.target.value)}
                    onBlur={() => {
                      if (mpgInput !== (mpg != null ? String(mpg) : "")) saveProfile({ mpg: mpgInput });
                    }}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
                    Fuel price per gallon
                  </span>
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="4.29"
                    value={fuelPriceInput}
                    onChange={(event) => setFuelPriceInput(event.target.value)}
                    onBlur={() => {
                      if (fuelPriceInput !== (fuelPrice != null ? String(fuelPrice) : "")) {
                        saveProfile({ fuel_price: fuelPriceInput });
                      }
                    }}
                  />
                </label>
              </div>
              {configured && carTotals.miles ? (
                <p className="mt-3 text-[13px] text-text-secondary">
                  {(carTotals.miles / mpg!).toFixed(0)} gallons · {formatCurrency(economics.fuelCost)} of fuel.
                </p>
              ) : null}
            </section>

            {configured && carTotals.miles ? (
              <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
                <h3 className="text-[15px] font-medium leading-tight text-text-primary">Would a different car help</h3>
                <p className="mt-2 text-[13px] text-text-secondary">
                  {economics.breakEvenMpg
                    ? economics.breakEvenMpg <= mpg!
                      ? `Breaks even at ${economics.breakEvenMpg.toFixed(0)} mpg and does ${mpg} — fuel economy is not what is costing you.`
                      : `A mile only breaks even at ${economics.breakEvenMpg.toFixed(0)} mpg. This car does ${mpg}.`
                    : "Repairs, insurance and payments alone already outrun the deduction. No amount of fuel economy fixes that."}
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="block w-40">
                    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
                      Compare against mpg
                    </span>
                    <input
                      className={inputClass}
                      type="number"
                      step="1"
                      min="0"
                      inputMode="decimal"
                      placeholder={String(Math.round(mpg! + 10))}
                      value={targetMpg}
                      onChange={(event) => setTargetMpg(event.target.value)}
                    />
                  </label>
                  {whatIf ? (
                    <p className="pb-3 text-[13px] text-text-secondary">
                      {whatIf.saved >= 0
                        ? `Saves ${formatCurrency(whatIf.saved)} of fuel over the same miles.`
                        : `Costs ${formatCurrency(Math.abs(whatIf.saved))} more fuel over the same miles.`}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {byKind.length ? (
              <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
                <h3 className="text-[15px] font-medium leading-tight text-text-primary">Where the money goes</h3>
                <div className="mt-3 space-y-2.5">
                  {byKind.map((row) => (
                    <div key={row.kind} className="grid grid-cols-[96px_1fr_76px] items-center gap-3">
                      <span className="text-[13px] text-text-secondary">{row.kind}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-subtle">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${Math.max(3, (row.amount / maxKind) * 100)}%` }}
                        />
                      </div>
                      <span className="text-right text-[13px] text-text-primary">{formatCurrency(row.amount)}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
              <h3 className="text-[15px] font-medium leading-tight text-text-primary">Car costs</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-[130px_130px_110px_1fr_auto]">
                <input
                  aria-label="Date"
                  className={inputClass}
                  type="date"
                  value={costDate}
                  onChange={(event) => setCostDate(event.target.value)}
                />
                <select
                  aria-label="Kind"
                  className={cn(inputClass, "font-medium")}
                  value={costKind}
                  onChange={(event) => setCostKind(event.target.value as VehicleCostKind)}
                >
                  {VEHICLE_COST_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Amount"
                  className={inputClass}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={costAmount}
                  onChange={(event) => setCostAmount(event.target.value)}
                />
                <input
                  aria-label="Note"
                  className={inputClass}
                  placeholder="Note"
                  value={costNote}
                  onChange={(event) => setCostNote(event.target.value)}
                />
                <Button variant="accent" onClick={addCost} disabled={savingCost || !costAmount}>
                  Add
                </Button>
              </div>

              {periodCosts.length ? (
                <div className="mt-3 divide-y divide-border">
                  {periodCosts.map((cost) => (
                    <div
                      key={cost.id}
                      className="grid grid-cols-[58px_92px_minmax(0,1fr)_76px_32px] items-center gap-2 py-2.5 text-[13px]"
                    >
                      <span className="text-text-tertiary">
                        {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
                          new Date(`${cost.incurred_on}T12:00:00`)
                        )}
                      </span>
                      <span className="text-text-secondary">{cost.kind}</span>
                      <span className="truncate text-text-primary">{cost.note ?? ""}</span>
                      <span className="text-right text-text-primary">{formatCurrency(cost.amount)}</span>
                      <button
                        type="button"
                        aria-label="Delete cost"
                        className="focus-ring justify-self-end rounded-lg p-1.5 text-text-tertiary hover:bg-subtle hover:text-danger"
                        onClick={() => removeCost(cost.id)}
                      >
                        <Trash2 size={15} strokeWidth={1.7} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-[13px] text-text-tertiary">
                  Nothing logged in {periodName}. Fuel is worked out from the miles above.
                </p>
              )}
            </section>

            <div>
              <button
                type="button"
                className="focus-ring w-full rounded-[20px] border border-border bg-surface px-4 py-3 text-left text-[13px] font-medium text-text-secondary shadow-card hover:text-text-primary"
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
                    onRestore={restore}
                    onChangeOwner={changeUploadOwner}
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

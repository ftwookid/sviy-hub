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
import { carEconomics, compareReplacement, normalizeCostKind } from "@/lib/vehicle";
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
      <div className="truncate text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-[21px] font-medium leading-none tracking-[-0.01em]",
          tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-text-primary"
        )}
      >
        {value}
      </div>
      {detail ? <div className="mt-1 truncate text-[12px] text-text-tertiary">{detail}</div> : null}
    </div>
  );
}

function StatStrip({ children, columns }: { children: React.ReactNode; columns: string }) {
  return (
    <section className={cn("grid divide-x divide-border rounded-[16px] border border-border bg-surface px-3", columns)}>
      {children}
    </section>
  );
}

export default function MileagePage() {
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
  const [candidateMpg, setCandidateMpg] = useState("");
  const [candidatePayment, setCandidatePayment] = useState("");
  const [candidateUpkeep, setCandidateUpkeep] = useState("500");
  const [showLedger, setShowLedger] = useState(false);
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
  const maxWeekdayMoney = Math.max(...weekdayData.rows.map((row) => row.money), 0.01);

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
  const carTripPool = useMemo(
    () => (selectedOwnerId === "all" ? trips.filter((trip) => trip.user_id === carOwnerId) : trips),
    [carOwnerId, selectedOwnerId, trips]
  );

  const mpg = profile?.mpg != null ? Number(profile.mpg) : null;
  const fuelPrice = profile?.fuel_price != null ? Number(profile.fuel_price) : null;
  const configured = Boolean(mpg && fuelPrice);

  /** One window of driving priced up: the same sum for this period and the last. */
  const statsForWindow = useCallback(
    (matches: (isoDate: string) => boolean) => {
      const windowTrips = carTripPool.filter((trip) => matches(trip.start_at));
      const windowCosts = costs.filter((cost) => matches(cost.incurred_on));
      const totals = totalsFor(windowTrips);
      return carEconomics({
        miles: totals.miles,
        benchmarkPerMile: totals.ratePerMile,
        mpg,
        fuelPrice,
        costs: windowCosts
      });
    },
    [carTripPool, costs, fuelPrice, mpg]
  );

  const car = useMemo(() => statsForWindow(inPeriod), [inPeriod, statsForWindow]);

  // The same length of time immediately before, so "up from" means something.
  const previousCar = useMemo(() => {
    if (period === "all") return null;
    if (period === "year") {
      const previousYear = selectedYear - 1;
      return statsForWindow((iso) => Number(iso.slice(0, 4)) === previousYear);
    }
    const [year, month] = selectedMonth.split("-").map(Number);
    const previous = new Date(year, month - 2, 1);
    const key = dateKey(previous).slice(0, 7);
    return statsForWindow((iso) => iso.slice(0, 7) === key);
  }, [period, selectedMonth, selectedYear, statsForWindow]);

  const previousLabel = period === "year" ? "last year" : period === "month" ? "the month before" : "";
  const comparable = Boolean(previousCar && previousCar.miles > 0 && car.miles > 0);
  const perMileChange = comparable ? car.costPerMile - previousCar!.costPerMile : 0;

  /**
   * Cost per mile, month by month, always over the twelve months ending with
   * the selected period. A trend needs history: scoped to the period, a Month
   * view would draw one bar, which cannot show a car getting worse — the one
   * thing this chart exists to show.
   */
  const costTrend = useMemo(() => {
    if (!configured) return [];
    const last = periodBounds.end;
    const first = new Date(last.getFullYear(), last.getMonth() - 11, 1);
    return monthsBetween(first, last).map((date) => {
      const key = dateKey(date).slice(0, 7);
      const stats = statsForWindow((iso) => iso.slice(0, 7) === key);
      return {
        key,
        axisLabel: period === "all" ? `${shortMonth(date)} ’${String(date.getFullYear()).slice(2)}` : shortMonth(date),
        costPerMile: stats.costPerMile,
        miles: stats.miles
      };
    });
  }, [configured, period, periodBounds.end, statsForWindow]);

  const trendCeiling = Math.max(...costTrend.map((point) => point.costPerMile), car.benchmarkPerMile * 1.35, 0.01);

  const daysObserved = Math.max(1, daysBetween(periodBounds.start, periodBounds.end).length);
  const replacement = useMemo(
    () =>
      compareReplacement({
        miles: car.miles,
        daysObserved,
        currentTotalCost: car.totalCost,
        fuelPrice,
        candidateMpg: Number(candidateMpg),
        monthlyPayment: Number(candidatePayment) || 0,
        yearlyUpkeep: Number(candidateUpkeep) || 0
      }),
    [candidateMpg, candidatePayment, candidateUpkeep, car.miles, car.totalCost, daysObserved, fuelPrice]
  );

  const periodCosts = useMemo(() => costs.filter((cost) => inPeriod(cost.incurred_on)), [costs, inPeriod]);

  /**
   * The sentence the page exists for. Ordered so the loudest true thing wins:
   * a car that is dear *and* getting dearer is a different decision from one
   * that is merely dear, and repairs driving the rise is the strongest single
   * argument for replacing it.
   */
  const verdict = useMemo(() => {
    if (!configured) {
      return { tone: "neutral" as const, headline: "—", line: "Add fuel economy and pump price below to price a mile." };
    }
    if (!car.miles) {
      return { tone: "neutral" as const, headline: "—", line: `No miles in ${periodName} to measure the car against.` };
    }

    const perMile = `${(car.costPerMile * 100).toFixed(0)}¢`;
    const benchmark = `${(car.benchmarkPerMile * 100).toFixed(0)}¢`;
    const dearer = car.vsBenchmark > 0;
    const rising = comparable && perMileChange > 0.02;
    const repairsLead = car.upkeepShare >= 0.35;
    const direction = comparable
      ? `${perMileChange >= 0 ? "Up" : "Down"} from ${(previousCar!.costPerMile * 100).toFixed(0)}¢ ${previousLabel}.`
      : "";

    if (dearer && repairsLead) {
      return {
        tone: "bad" as const,
        headline: perMile,
        line: `${direction} Repairs are ${formatCurrency(car.upkeepCost)} of that — ${Math.round(
          car.upkeepShare * 100
        )}% of what the car costs to run. An ordinary car runs at about ${benchmark} a mile. Replacing this one would likely pay for itself.`
      };
    }
    if (dearer) {
      return {
        tone: "bad" as const,
        headline: perMile,
        line: `${direction} That is more than the ${benchmark} an ordinary car costs to run. Worth pricing a replacement below.`
      };
    }
    if (rising) {
      return {
        tone: "watch" as const,
        headline: perMile,
        line: `${direction} Still under the ${benchmark} an ordinary car costs, but the gap is closing.`
      };
    }
    return {
      tone: "good" as const,
      headline: perMile,
      line: `${direction} An ordinary car runs at about ${benchmark} a mile, so this one is cheap to keep. Drive it into the ground.`
    };
  }, [car, comparable, configured, perMileChange, periodName, previousCar, previousLabel]);

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
  const compactInput =
    "focus-ring mt-0.5 h-8 w-full rounded-lg border border-border bg-subtle px-2 text-[14px] text-text-primary placeholder:text-text-tertiary";
  const carOwnerName = ownerLabels[carOwnerId] ?? "your";

  return (
    <AppShell user={user}>
      <div className="space-y-2.5">
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

            {/* One container: the run over time, and the same period folded onto a
                week. Two questions about the same bars do not need two cards. */}
            <section className="rounded-[16px] border border-border bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
                <h2 className="text-[14px] font-medium leading-tight text-text-primary">
                  {period === "month" ? "Daily" : "Monthly"} · {periodName}
                </h2>
                <div className="inline-grid h-7 grid-cols-2 rounded-lg border border-border bg-subtle p-0.5">
                  {(["miles", "money"] as ChartUnit[]).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      className={cn(
                        "focus-ring min-w-[54px] rounded-[6px] px-2 text-[12px] font-medium transition duration-150 ease-out",
                        chartUnit === unit ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary"
                      )}
                      onClick={() => setChartUnit(unit)}
                    >
                      {unit === "miles" ? "Miles" : "Dollars"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 overflow-x-auto px-3 pb-5">
                <div
                  className="grid h-36 items-end gap-1.5 border-b border-border"
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
                          className={cn("w-full rounded-t-[4px]", value ? "bg-accent" : "bg-subtle")}
                          style={{ height: value ? `max(5px, ${(value / maxChartValue) * 88}%)` : "2px" }}
                        />
                        <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-text-tertiary">
                          {item.axisLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Seven columns rather than seven stacked rows — same information,
                  a third of the height, and the shape of the week reads at once. */}
              <div className="grid grid-cols-7 gap-1.5 border-t border-border px-3 py-3">
                {weekdayData.rows.map((day) => {
                  const busiest = day.index === weekdayData.busiestIndex;
                  const value = chartUnit === "miles" ? day.miles : day.money;
                  const peak = chartUnit === "miles" ? maxWeekdayMiles : maxWeekdayMoney;
                  return (
                    <div key={day.label} className="flex min-w-0 flex-col items-center gap-1">
                      <span className={cn("text-[10px]", busiest ? "font-medium text-text-primary" : "text-text-tertiary")}>
                        {chartUnit === "miles" ? day.miles.toFixed(0) : compactMoney(day.money)}
                      </span>
                      <div className="flex h-10 w-full items-end">
                        <div
                          className={cn("w-full rounded-t-[4px]", busiest ? "bg-text-primary" : value ? "bg-accent/70" : "bg-subtle")}
                          style={{ height: value ? `max(4px, ${(value / peak) * 100}%)` : "2px" }}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-[11px]",
                          busiest ? "font-medium text-text-primary" : "text-text-secondary"
                        )}
                      >
                        {day.label.slice(0, 3)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {carError ? (
              <section className="rounded-[16px] border border-warning/20 bg-warning-soft p-3">
                <p className="text-[13px] text-text-secondary">
                  Run <code className="rounded bg-white/70 px-1.5 py-0.5">supabase/vehicle-schema.sql</code> in
                  Supabase, then refresh.
                </p>
                <p className="mt-1.5 text-[11px] text-warning">{carError}</p>
              </section>
            ) : null}

            {/* The whole point of the car half: one number, and what to do
                about it. Everything below is the working behind this. */}
            <section
              className={cn(
                "rounded-[16px] border p-4",
                verdict.tone === "bad"
                  ? "border-danger/25 bg-danger-soft"
                  : verdict.tone === "watch"
                    ? "border-warning/25 bg-warning-soft"
                    : verdict.tone === "good"
                      ? "border-success/25 bg-success-soft"
                      : "border-border bg-surface"
              )}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[32px] font-medium leading-none tracking-[-0.02em] text-text-primary">
                  {verdict.headline}
                </span>
                <span className="text-[13px] text-text-secondary">
                  a mile to run {selectedOwnerId === "all" ? `${carOwnerName}’s car` : ""} · {periodName}
                </span>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-text-primary">{verdict.line}</p>
            </section>

            <section className="rounded-[16px] border border-border bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
                <h2 className="text-[14px] font-medium leading-tight text-text-primary">Cost per mile · 12 months</h2>
                <span className="text-[11px] text-text-tertiary">
                  dashed line — {(car.benchmarkPerMile * 100).toFixed(0)}¢, what an ordinary car runs at
                </span>
              </div>

              {configured && costTrend.length ? (
                <div className="mt-3 overflow-x-auto px-3 pb-5">
                  <div
                    className="relative grid h-32 items-end gap-1.5 border-b border-border"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(costTrend.length, 1)}, minmax(0, 1fr))`,
                      minWidth: "100%"
                    }}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 border-t border-dashed border-text-tertiary/60"
                      style={{ bottom: `${(car.benchmarkPerMile / trendCeiling) * 100}%` }}
                    />
                    {costTrend.map((point) => {
                      const over = point.costPerMile > car.benchmarkPerMile;
                      return (
                        <div key={point.key} className="relative flex h-full min-w-0 flex-col justify-end">
                          <span
                            className={cn(
                              "mb-1 text-center text-[10px]",
                              point.miles ? "text-text-tertiary" : "text-transparent"
                            )}
                          >
                            {point.miles ? `${(point.costPerMile * 100).toFixed(0)}¢` : "0"}
                          </span>
                          <div
                            className={cn("w-full rounded-t-[4px]", !point.miles ? "bg-subtle" : over ? "bg-danger" : "bg-accent")}
                            style={{
                              height: point.miles ? `max(5px, ${(point.costPerMile / trendCeiling) * 92}%)` : "2px"
                            }}
                          />
                          <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-text-tertiary">
                            {point.axisLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="px-3 py-6 text-center text-[13px] text-text-tertiary">
                  Fuel economy and pump price price a mile.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 border-t border-border px-3 py-2.5 sm:grid-cols-4">
                <label className="block">
                  <span className="block text-[10px] font-medium uppercase tracking-[0.05em] text-text-tertiary">mpg</span>
                  <input
                    className={compactInput}
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
                  <span className="block text-[10px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
                    $/gallon
                  </span>
                  <input
                    className={compactInput}
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
                <div className="block">
                  <span className="block text-[10px] font-medium uppercase tracking-[0.05em] text-text-tertiary">Fuel</span>
                  <span className="mt-0.5 block text-[14px] text-text-primary">{formatCurrency(car.fuelCost)}</span>
                </div>
                <div className="block">
                  <span className="block text-[10px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
                    Everything else
                  </span>
                  <span className="mt-0.5 block text-[14px] text-text-primary">{formatCurrency(car.loggedCost)}</span>
                </div>
              </div>
            </section>

            <div className="grid gap-2.5 lg:grid-cols-2">
              {/* Reliability. A car that is going shows up here before anywhere. */}
              <section className="rounded-[16px] border border-border bg-surface p-3">
                <h3 className="text-[14px] font-medium leading-tight text-text-primary">Repairs and upkeep</h3>
                <div className="mt-2.5 flex items-baseline gap-2">
                  <span className="text-[24px] font-medium leading-none tracking-[-0.01em] text-text-primary">
                    {formatCurrency(car.upkeepCost)}
                  </span>
                  <span className="text-[12px] text-text-tertiary">
                    {car.upkeepCount} {car.upkeepCount === 1 ? "time" : "times"} · {periodName}
                  </span>
                </div>
                {previousCar ? (
                  <p className="mt-2 text-[13px] text-text-secondary">
                    {formatCurrency(previousCar.upkeepCost)} over {previousCar.upkeepCount}{" "}
                    {previousCar.upkeepCount === 1 ? "time" : "times"} {previousLabel}.
                    {car.upkeepCost > previousCar.upkeepCost * 1.5 && previousCar.upkeepCost > 0
                      ? " Getting worse."
                      : ""}
                  </p>
                ) : null}
                {car.totalCost ? (
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-subtle">
                    <div
                      className="h-full rounded-full bg-danger"
                      style={{ width: `${Math.min(100, car.upkeepShare * 100)}%` }}
                    />
                  </div>
                ) : null}
                {car.totalCost ? (
                  <p className="mt-1.5 text-[12px] text-text-tertiary">
                    {Math.round(car.upkeepShare * 100)}% of what the car costs to run
                  </p>
                ) : null}
              </section>

              {/* And the other half of the question: would swapping it help? */}
              <section className="rounded-[16px] border border-border bg-surface p-3">
                <h3 className="text-[14px] font-medium leading-tight text-text-primary">Price a replacement</h3>
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="block text-[10px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
                      mpg
                    </span>
                    <input
                      className={compactInput}
                      type="number"
                      min="0"
                      inputMode="decimal"
                      placeholder="35"
                      value={candidateMpg}
                      onChange={(event) => setCandidateMpg(event.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
                      $/month
                    </span>
                    <input
                      className={compactInput}
                      type="number"
                      min="0"
                      inputMode="decimal"
                      placeholder="340"
                      value={candidatePayment}
                      onChange={(event) => setCandidatePayment(event.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
                      Upkeep/yr
                    </span>
                    <input
                      className={compactInput}
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={candidateUpkeep}
                      onChange={(event) => setCandidateUpkeep(event.target.value)}
                    />
                  </label>
                </div>
                {replacement ? (
                  <>
                    <div className="mt-3 grid grid-cols-2 divide-x divide-border">
                      <div className="pr-3">
                        <div className="text-[11px] text-text-tertiary">This car</div>
                        <div className="mt-1 text-[19px] font-medium leading-none text-text-primary">
                          {formatCurrency(replacement.currentYearly)}
                        </div>
                      </div>
                      <div className="pl-3">
                        <div className="text-[11px] text-text-tertiary">That one</div>
                        <div className="mt-1 text-[19px] font-medium leading-none text-text-primary">
                          {formatCurrency(replacement.candidateYearly)}
                        </div>
                      </div>
                    </div>
                    <p
                      className={cn(
                        "mt-2.5 text-[13px]",
                        replacement.saved > 0 ? "text-success" : "text-text-secondary"
                      )}
                    >
                      {replacement.saved > 0
                        ? `Switching saves ${formatCurrency(replacement.saved)} a year at ${replacement.annualMiles.toFixed(0)} miles.`
                        : `Switching costs ${formatCurrency(Math.abs(replacement.saved))} a year more at ${replacement.annualMiles.toFixed(0)} miles.`}
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-[13px] text-text-tertiary">
                    Enter a car&rsquo;s economy and payment to compare a year of each.
                  </p>
                )}
              </section>
            </div>

            <div>
              <button
                type="button"
                className="focus-ring flex w-full items-center justify-between rounded-[16px] border border-border bg-surface px-3 py-2.5 text-left text-[13px] font-medium text-text-secondary hover:text-text-primary"
                onClick={() => setShowLedger(!showLedger)}
              >
                <span>Car costs · {periodName}</span>
                <span className="text-text-tertiary">
                  {periodCosts.length} logged · {formatCurrency(car.loggedCost)}
                </span>
              </button>
              {showLedger ? (
                <section className="mt-2 rounded-[16px] border border-border bg-surface p-3">
                  <div className="grid gap-2 sm:grid-cols-[130px_130px_110px_1fr_auto]">
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
                    <div className="mt-2 divide-y divide-border">
                      {periodCosts.map((cost) => (
                        <div
                          key={cost.id}
                          className="grid grid-cols-[58px_92px_minmax(0,1fr)_76px_32px] items-center gap-2 py-2 text-[13px]"
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
                    <p className="py-6 text-center text-[13px] text-text-tertiary">
                      Nothing logged. Fuel comes from the miles above.
                    </p>
                  )}
                </section>
              ) : null}
            </div>

            <div>
              <button
                type="button"
                className="focus-ring w-full rounded-[16px] border border-border bg-surface px-3 py-2.5 text-left text-[13px] font-medium text-text-secondary hover:text-text-primary"
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

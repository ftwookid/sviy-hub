"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
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
  destinationArea,
  loadMileageTrips,
  loadMileageUploads,
  monthLabel,
  monthsBetween,
  shortMonth,
  totalsFor
} from "@/lib/mileage";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { MileageTrip, MileageUpload } from "@/types/mileage";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];
const DRIVES_SHOWN = 12;

type Period = "month" | "year" | "all";
type OwnerOption = { id: string; label: string };

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">{label}</div>
      <div className="mt-2.5 text-[24px] font-medium leading-none tracking-[-0.01em] text-text-primary">{value}</div>
      <div className="mt-1.5 h-4 text-[12px] text-text-tertiary">{detail ?? ""}</div>
    </div>
  );
}

export default function MileagePage() {
  const now = useMemo(() => new Date(), []);
  const { user, isAdmin, authLoading } = useAuthUser();
  const [uploads, setUploads] = useState<MileageUpload[]>([]);
  const [trips, setTrips] = useState<MileageTrip[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");
  const [toast, setToast] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("year");
  const [selectedMonth, setSelectedMonth] = useState(dateKey(new Date(now.getFullYear(), now.getMonth(), 1)).slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [showAllDrives, setShowAllDrives] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [restoringId, setRestoringId] = useState("");
  const [changingOwnerId, setChangingOwnerId] = useState("");

  const ownerLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    ownerOptions.forEach((owner) => {
      labels[owner.id] = owner.label;
    });
    return labels;
  }, [ownerOptions]);

  const importOwnerId = isAdmin && selectedOwnerId !== "all" ? selectedOwnerId : user?.id ?? "";
  const importOwnerLabel = ownerLabels[importOwnerId] ?? "your account";

  const loadMileage = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setSchemaError("");

    const scope = { userId: user.id, isAdmin, ownerId: selectedOwnerId };
    const { uploads: nextUploads, error: uploadError } = await loadMileageUploads(scope);
    if (uploadError) {
      setSchemaError(uploadError.message);
      setLoading(false);
      return;
    }

    const active = nextUploads.filter((upload) => upload.is_active);
    const { trips: nextTrips, error: tripError } = await loadMileageTrips(
      scope,
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
  }, [isAdmin, selectedOwnerId, user]);

  useEffect(() => {
    loadMileage();
  }, [loadMileage]);

  useEffect(() => {
    if (!supabase || !user || !isAdmin) return;
    let active = true;

    async function loadOwners() {
      const {
        data: { session }
      } = await supabase!.auth.getSession();
      if (!session?.access_token) return;

      try {
        const response = await fetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (!response.ok) return;
        const body = (await response.json()) as { users?: OwnerOption[] };
        if (active) setOwnerOptions(body.users ?? []);
      } catch {
        if (active) setOwnerOptions([]);
      }
    }

    loadOwners();
    return () => {
      active = false;
    };
  }, [isAdmin, user]);

  const availableMonths = useMemo(
    () =>
      Array.from(new Set(uploads.filter((u) => u.is_active).map((u) => u.period_month.slice(0, 7)))).sort((a, b) =>
        b.localeCompare(a)
      ),
    [uploads]
  );

  const availableYears = useMemo(() => {
    const values = Array.from(
      new Set(uploads.filter((u) => u.is_active).map((u) => Number(u.period_month.slice(0, 4))))
    );
    if (!values.includes(now.getFullYear())) values.push(now.getFullYear());
    return values.sort((a, b) => b - a);
  }, [now, uploads]);

  const periodTrips = useMemo(
    () =>
      trips.filter((trip) => {
        if (period === "month") return trip.start_at.slice(0, 7) === selectedMonth;
        if (period === "year") return dateFromTimestamp(trip.start_at).getFullYear() === selectedYear;
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
      const stamps = periodTrips.map((trip) => dateFromTimestamp(trip.start_at).getTime());
      return { start: new Date(Math.min(...stamps)), end: new Date(Math.max(...stamps)) };
    }
    return { start: now, end: now };
  }, [now, period, periodTrips, selectedMonth, selectedYear]);

  const periodName = period === "month" ? monthLabel(selectedMonth) : period === "year" ? String(selectedYear) : "All time";
  const totals = totalsFor(periodTrips);
  const averageTrip = totals.trips ? totals.miles / totals.trips : 0;

  const busiestWeekday = useMemo(() => {
    const rows = MONDAY_FIRST.map((index) => ({
      index,
      label: WEEKDAYS[index],
      miles: periodTrips
        .filter((trip) => dateFromTimestamp(trip.start_at).getDay() === index)
        .reduce((sum, trip) => sum + Number(trip.miles), 0)
    }));
    return rows.slice().sort((a, b) => b.miles - a.miles)[0];
  }, [periodTrips]);

  const chartData = useMemo(() => {
    const totalsByKey = new Map<string, number>();
    periodTrips.forEach((trip) => {
      const key = period === "month" ? trip.start_at.slice(0, 10) : trip.start_at.slice(0, 7);
      totalsByKey.set(key, (totalsByKey.get(key) ?? 0) + Number(trip.miles));
    });

    if (period === "month") {
      return daysBetween(periodBounds.start, periodBounds.end).map((date) => ({
        key: dateKey(date),
        axisLabel: String(date.getDate()),
        miles: totalsByKey.get(dateKey(date)) ?? 0
      }));
    }

    return monthsBetween(periodBounds.start, periodBounds.end).map((date) => {
      const key = dateKey(date).slice(0, 7);
      return {
        key,
        axisLabel:
          period === "all" ? `${shortMonth(date)} ’${String(date.getFullYear()).slice(2)}` : shortMonth(date),
        miles: totalsByKey.get(key) ?? 0
      };
    });
  }, [period, periodBounds.end, periodBounds.start, periodTrips]);

  const maxChartMiles = Math.max(...chartData.map((item) => item.miles), 1);
  const visibleDrives = showAllDrives ? periodTrips : periodTrips.slice(0, DRIVES_SHOWN);

  function flash(message: string, focusMonth?: string) {
    if (focusMonth) {
      const month = focusMonth.slice(0, 7);
      setPeriod("month");
      setSelectedMonth(month);
      setSelectedYear(Number(month.slice(0, 4)));
    }
    setToast(message);
    loadMileage();
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

  async function changeUploadOwner(upload: MileageUpload, nextOwnerId: string) {
    if (!supabase || !isAdmin || nextOwnerId === upload.user_id) return;
    const label = monthLabel(upload.period_month.slice(0, 7));
    const nextOwnerLabel = ownerLabels[nextOwnerId] ?? `User ${nextOwnerId.slice(0, 8)}`;
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

          {isAdmin ? (
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
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
              <Stat
                label="Busiest day"
                value={totals.trips ? busiestWeekday.label : "—"}
                detail={totals.trips ? `${busiestWeekday.miles.toFixed(1)} mi` : undefined}
              />
            </section>

            <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
              <h2 className="text-[15px] font-medium leading-tight text-text-primary">
                {period === "month" ? "Daily miles" : "Monthly miles"} · {periodName}
              </h2>
              <div className="mt-5 overflow-x-auto pb-5">
                <div
                  className="grid h-44 items-end gap-1.5 border-b border-border"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(chartData.length, 1)}, minmax(0, 1fr))`,
                    minWidth: period === "month" ? "760px" : period === "all" ? `${Math.max(100, chartData.length * 52)}px` : "100%"
                  }}
                >
                  {chartData.map((item) => (
                    <div key={item.key} className="group relative flex h-full min-w-0 flex-col justify-end">
                      <span
                        className={cn(
                          "mb-1 text-center text-[10px]",
                          item.miles ? "text-text-tertiary" : "text-transparent"
                        )}
                      >
                        {item.miles.toFixed(0)}
                      </span>
                      <div
                        className={cn("w-full rounded-t-[5px]", item.miles ? "bg-accent" : "bg-subtle")}
                        style={{ height: item.miles ? `max(6px, ${(item.miles / maxChartMiles) * 88}%)` : "2px" }}
                      />
                      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[11px] text-text-tertiary">
                        {item.axisLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
              <h2 className="text-[15px] font-medium leading-tight text-text-primary">Drives · {totals.trips}</h2>
              {periodTrips.length ? (
                <>
                  <div className="mt-2 divide-y divide-border">
                    {visibleDrives.map((trip) => {
                      const date = dateFromTimestamp(trip.start_at);
                      return (
                        <div
                          key={trip.id}
                          className="grid grid-cols-[58px_minmax(0,1fr)_64px_72px] items-center gap-2 py-2.5 text-[13px]"
                        >
                          <span className="text-text-tertiary">
                            {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)}
                          </span>
                          <span className="truncate text-text-primary">{destinationArea(trip.stop_location)}</span>
                          <span className="text-right text-text-secondary">{Number(trip.miles).toFixed(1)} mi</span>
                          <span className="text-right text-text-secondary">{formatCurrency(trip.deduction_value)}</span>
                        </div>
                      );
                    })}
                  </div>
                  {periodTrips.length > DRIVES_SHOWN ? (
                    <button
                      type="button"
                      className="focus-ring mt-3 w-full rounded-xl py-2 text-[13px] font-medium text-text-secondary hover:bg-subtle"
                      onClick={() => setShowAllDrives(!showAllDrives)}
                    >
                      {showAllDrives ? "Show less" : `Show all ${periodTrips.length}`}
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="py-8 text-center text-[13px] text-text-tertiary">No drives in {periodName}.</p>
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
                    canChangeOwner={isAdmin}
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

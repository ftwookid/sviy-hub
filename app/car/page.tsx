"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SectionTabs } from "@/components/SectionTabs";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatCurrency, todayInputValue } from "@/lib/formatters";
import { dateFromTimestamp, loadMileageTrips, loadMileageUploads, totalsFor } from "@/lib/mileage";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import { carEconomics, normalizeCostKind, savingsAtMpg } from "@/lib/vehicle";
import { VEHICLE_COST_KINDS } from "@/types/vehicle";
import type { VehicleCost, VehicleCostKind, VehicleProfile } from "@/types/vehicle";

type OwnerOption = { id: string; label: string };

function centsPerMile(value: number) {
  return `${(value * 100).toFixed(1)}¢`;
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "good" | "bad" }) {
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

export default function CarPage() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const { user, isAdmin, authLoading } = useAuthUser();
  const [year, setYear] = useState(currentYear);
  const [ownerId, setOwnerId] = useState("");
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [costs, setCosts] = useState<VehicleCost[]>([]);
  const [miles, setMiles] = useState(0);
  const [deduction, setDeduction] = useState(0);
  const [loading, setLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");
  const [toast, setToast] = useState("");

  const [mpgInput, setMpgInput] = useState("");
  const [fuelPriceInput, setFuelPriceInput] = useState("");
  const [targetMpg, setTargetMpg] = useState("");

  const [costDate, setCostDate] = useState(todayInputValue());
  const [costKind, setCostKind] = useState<VehicleCostKind>("Repair");
  const [costAmount, setCostAmount] = useState("");
  const [costNote, setCostNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user && !ownerId) setOwnerId(user.id);
  }, [ownerId, user]);

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

  const load = useCallback(async () => {
    if (!supabase || !user || !ownerId) return;
    setLoading(true);
    setSchemaError("");

    const [{ data: profileData, error: profileError }, { data: costData, error: costError }] = await Promise.all([
      supabase.from("vehicle_profiles").select("*").eq("user_id", ownerId).maybeSingle(),
      supabase
        .from("vehicle_costs")
        .select("*")
        .eq("user_id", ownerId)
        .gte("incurred_on", `${year}-01-01`)
        .lte("incurred_on", `${year}-12-31`)
        .order("incurred_on", { ascending: false })
    ]);

    if (profileError || costError) {
      setSchemaError((profileError ?? costError)!.message);
      setLoading(false);
      return;
    }

    const nextProfile = (profileData ?? null) as VehicleProfile | null;
    setProfile(nextProfile);
    setMpgInput(nextProfile?.mpg != null ? String(nextProfile.mpg) : "");
    setFuelPriceInput(nextProfile?.fuel_price != null ? String(nextProfile.fuel_price) : "");
    setCosts(
      ((costData ?? []) as VehicleCost[]).map((cost) => ({ ...cost, kind: normalizeCostKind(cost.kind) }))
    );

    // The car's cost only means something against the miles it covered, so the
    // same trips the Mileage tab totals are what this is measured over.
    const scope = { userId: user.id, isAdmin, ownerId };
    const { uploads } = await loadMileageUploads(scope);
    const { trips } = await loadMileageTrips(
      scope,
      uploads.filter((upload) => upload.is_active).map((upload) => upload.id)
    );
    const yearTrips = trips.filter((trip) => dateFromTimestamp(trip.start_at).getFullYear() === year);
    const totals = totalsFor(yearTrips);
    setMiles(totals.miles);
    setDeduction(totals.deduction);
    setLoading(false);
  }, [isAdmin, ownerId, user, year]);

  useEffect(() => {
    load();
  }, [load]);

  const mpg = profile?.mpg != null ? Number(profile.mpg) : null;
  const fuelPrice = profile?.fuel_price != null ? Number(profile.fuel_price) : null;
  const economics = useMemo(
    () => carEconomics({ miles, deduction, mpg, fuelPrice, costs }),
    [costs, deduction, fuelPrice, miles, mpg]
  );

  const configured = Boolean(mpg && fuelPrice);
  const whatIf = useMemo(
    () => savingsAtMpg({ miles, fuelPrice, currentMpg: mpg, targetMpg: Number(targetMpg) }),
    [fuelPrice, miles, mpg, targetMpg]
  );

  const byKind = useMemo(() => {
    const rows = VEHICLE_COST_KINDS.map((kind) => ({
      kind,
      amount: costs.filter((cost) => cost.kind === kind).reduce((sum, cost) => sum + Number(cost.amount), 0)
    })).filter((row) => row.amount > 0);
    if (economics.fuelCost > 0) rows.unshift({ kind: "Fuel" as VehicleCostKind, amount: economics.fuelCost });
    return rows;
  }, [costs, economics.fuelCost]);
  const maxKind = Math.max(...byKind.map((row) => row.amount), 1);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  async function saveProfile(next: { mpg?: string; fuel_price?: string }) {
    if (!supabase || !ownerId) return;
    const payload = {
      user_id: ownerId,
      mpg: next.mpg !== undefined ? (next.mpg === "" ? null : Number(next.mpg)) : mpg,
      fuel_price: next.fuel_price !== undefined ? (next.fuel_price === "" ? null : Number(next.fuel_price)) : fuelPrice,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from("vehicle_profiles").upsert(payload, { onConflict: "user_id" });
    if (error) {
      setSchemaError(error.message);
      return;
    }
    load();
  }

  async function addCost() {
    if (!supabase || !ownerId) return;
    const amount = Number(costAmount);
    if (!costDate || !amount) return;

    setSaving(true);
    const { error } = await supabase.from("vehicle_costs").insert({
      user_id: ownerId,
      incurred_on: costDate,
      kind: costKind,
      amount,
      note: costNote.trim() || null
    });
    setSaving(false);
    if (error) {
      setSchemaError(error.message);
      return;
    }
    setCostAmount("");
    setCostNote("");
    flash("Cost added");
    load();
  }

  async function removeCost(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from("vehicle_costs").delete().eq("id", id);
    if (error) {
      setSchemaError(error.message);
      return;
    }
    load();
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  const selectClass =
    "focus-ring h-11 rounded-xl border border-border bg-surface px-3 text-[15px] font-medium text-text-primary shadow-sm";
  const inputClass =
    "focus-ring h-11 w-full rounded-xl border border-border bg-subtle px-3 text-[15px] text-text-primary placeholder:text-text-tertiary";

  const verdict = !configured
    ? "Add the car's fuel economy and what you pay at the pump to see what a business mile actually costs."
    : !miles
      ? `No miles imported for ${year} yet, so there is nothing to measure the car against.`
      : economics.netPerMile >= 0
        ? `Every business mile returns ${centsPerMile(economics.ratePerMile)} and costs ${centsPerMile(
            economics.costPerMile
          )}. The car covers itself by ${formatCurrency(economics.netTotal)} across ${miles.toFixed(0)} miles.`
        : `Every business mile returns ${centsPerMile(economics.ratePerMile)} but costs ${centsPerMile(
            economics.costPerMile
          )}. Over ${miles.toFixed(0)} miles that is ${formatCurrency(Math.abs(economics.netTotal))} out of pocket.`;

  return (
    <AppShell user={user}>
      <div className="space-y-3">
        <SectionTabs />

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Year"
            className={cn(selectClass, "min-w-0 flex-1 sm:max-w-[120px]")}
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {[currentYear + 1, currentYear, currentYear - 1, currentYear - 2].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {isAdmin && ownerOptions.length ? (
            <select
              aria-label="Driver"
              className={cn(selectClass, "min-w-0 flex-1 sm:max-w-[180px]")}
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
            >
              {ownerOptions.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {schemaError ? (
          <section className="rounded-[20px] border border-warning/20 bg-warning-soft p-4">
            <p className="text-[13px] text-text-secondary">
              Run <code className="rounded bg-white/70 px-1.5 py-0.5">supabase/vehicle-schema.sql</code> in Supabase,
              then refresh.
            </p>
            <p className="mt-2 text-[11px] text-warning">{schemaError}</p>
          </section>
        ) : null}

        {loading ? (
          <SkeletonRows />
        ) : (
          <>
            <section
              className={cn(
                "rounded-[20px] border p-4 shadow-card",
                configured && miles && economics.netPerMile < 0
                  ? "border-danger/20 bg-danger-soft"
                  : "border-border bg-[#F5EFE3]"
              )}
            >
              <p className="text-[15px] leading-relaxed text-text-primary">{verdict}</p>
            </section>

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label="Cost per mile"
                value={configured && miles ? centsPerMile(economics.costPerMile) : "—"}
                detail={configured && miles ? `${formatCurrency(economics.totalCost)} in ${year}` : undefined}
              />
              <Stat
                label="Returned per mile"
                value={miles ? centsPerMile(economics.ratePerMile) : "—"}
                detail={miles ? `${formatCurrency(deduction)} deducted` : undefined}
              />
              <Stat
                label="Kept per mile"
                value={configured && miles ? centsPerMile(economics.netPerMile) : "—"}
                tone={configured && miles ? (economics.netPerMile >= 0 ? "good" : "bad") : undefined}
                detail={configured && miles ? formatCurrency(economics.netTotal) : undefined}
              />
              <Stat
                label="Upkeep / 1,000 mi"
                value={miles ? formatCurrency(economics.upkeepPerThousandMiles) : "—"}
                detail={
                  economics.totalCost ? `${Math.round(economics.upkeepShare * 100)}% of running cost` : undefined
                }
              />
            </section>

            <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
              <h2 className="text-[15px] font-medium leading-tight text-text-primary">The car</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
              {configured && miles ? (
                <p className="mt-3 text-[13px] text-text-secondary">
                  {(miles / mpg!).toFixed(0)} gallons · {formatCurrency(economics.fuelCost)} of fuel to cover {year}
                  &rsquo;s business miles.
                </p>
              ) : null}
            </section>

            {configured && miles ? (
              <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
                <h2 className="text-[15px] font-medium leading-tight text-text-primary">Would a different car help</h2>
                <p className="mt-2 text-[13px] text-text-secondary">
                  {economics.breakEvenMpg
                    ? economics.breakEvenMpg <= mpg!
                      ? `This car breaks even at ${economics.breakEvenMpg.toFixed(0)} mpg and does ${mpg} — fuel economy is not what is costing you.`
                      : `A mile only breaks even at ${economics.breakEvenMpg.toFixed(0)} mpg. This car does ${mpg}.`
                    : `Repairs, insurance and payments alone already outrun the deduction. No amount of fuel economy fixes that.`}
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
                        ? `Saves ${formatCurrency(whatIf.saved)} of fuel over the same ${miles.toFixed(0)} miles.`
                        : `Costs ${formatCurrency(Math.abs(whatIf.saved))} more fuel over the same ${miles.toFixed(0)} miles.`}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {byKind.length ? (
              <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
                <h2 className="text-[15px] font-medium leading-tight text-text-primary">Where the money goes</h2>
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
              <h2 className="text-[15px] font-medium leading-tight text-text-primary">Car costs · {year}</h2>
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
                <Button variant="accent" onClick={addCost} disabled={saving || !costAmount}>
                  Add
                </Button>
              </div>

              {costs.length ? (
                <div className="mt-3 divide-y divide-border">
                  {costs.map((cost) => (
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
                  Nothing logged for {year}. Fuel is worked out from the miles above.
                </p>
              )}
            </section>
          </>
        )}
      </div>
      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}

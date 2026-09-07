"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateField } from "@/components/ui/DateField";
import { cn } from "@/lib/cn";
import { formatCurrency, todayInputValue } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
import { normalizeCostKind } from "@/lib/vehicle";
import { VEHICLE_COST_KINDS } from "@/types/vehicle";
import type { VehicleCost, VehicleCostKind, VehicleProfile } from "@/types/vehicle";

/**
 * Where the car's numbers are entered.
 *
 * It lives in settings rather than on Mileage because it is setup, not reading:
 * fuel economy is typed once and a repair a few times a year, while the page
 * that consumes them is opened to look at totals. Everyone sees the result;
 * only an admin gets this card.
 */
export function VehicleSettingsCard({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [costs, setCosts] = useState<VehicleCost[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [mpgInput, setMpgInput] = useState("");
  const [fuelPriceInput, setFuelPriceInput] = useState("");

  const [costDate, setCostDate] = useState(todayInputValue());
  const [costKind, setCostKind] = useState<VehicleCostKind>("Repair");
  const [costAmount, setCostAmount] = useState("");
  const [costNote, setCostNote] = useState("");
  const [saving, setSaving] = useState(false);
  // A logged cost is a receipt somebody typed up months ago, and the trash sits
  // on every row of the ledger — so it asks before the row goes.
  const [deletingCost, setDeletingCost] = useState<VehicleCost | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError("");

    // One car, one ledger, shared like the rest of the books.
    const [{ data: profileData, error: profileError }, { data: costData, error: costError }] = await Promise.all([
      supabase.from("vehicle_profiles").select("*").order("updated_at", { ascending: false }).limit(1),
      supabase.from("vehicle_costs").select("*").order("incurred_on", { ascending: false })
    ]);

    if (profileError || costError) {
      setError((profileError ?? costError)!.message);
      setLoading(false);
      return;
    }

    const nextProfile = (((profileData ?? []) as VehicleProfile[])[0] ?? null) as VehicleProfile | null;
    setProfile(nextProfile);
    setMpgInput(nextProfile?.mpg != null ? String(nextProfile.mpg) : "");
    setFuelPriceInput(nextProfile?.fuel_price != null ? String(nextProfile.fuel_price) : "");
    setCosts(((costData ?? []) as VehicleCost[]).map((cost) => ({ ...cost, kind: normalizeCostKind(cost.kind) })));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const mpg = profile?.mpg != null ? Number(profile.mpg) : null;
  const fuelPrice = profile?.fuel_price != null ? Number(profile.fuel_price) : null;
  const logged = useMemo(() => costs.reduce((sum, cost) => sum + Number(cost.amount), 0), [costs]);

  async function saveProfile(next: { mpg?: string; fuel_price?: string }) {
    if (!supabase) return;
    // Update the existing row wherever it sits, so a second admin editing does
    // not open a rival car alongside the first.
    const { error: saveError } = await supabase.from("vehicle_profiles").upsert(
      {
        ...(profile ? { id: profile.id } : {}),
        user_id: profile?.user_id ?? userId,
        mpg: next.mpg !== undefined ? (next.mpg === "" ? null : Number(next.mpg)) : mpg,
        fuel_price:
          next.fuel_price !== undefined ? (next.fuel_price === "" ? null : Number(next.fuel_price)) : fuelPrice,
        updated_at: new Date().toISOString()
      },
      { onConflict: profile ? "id" : "user_id" }
    );
    if (saveError) {
      setError(saveError.message);
      return;
    }
    load();
  }

  async function addCost() {
    if (!supabase) return;
    const amount = Number(costAmount);
    if (!costDate || !amount) return;

    setSaving(true);
    const { error: insertError } = await supabase.from("vehicle_costs").insert({
      user_id: userId,
      incurred_on: costDate,
      kind: costKind,
      amount,
      note: costNote.trim() || null
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setCostAmount("");
    setCostNote("");
    load();
  }

  /** A note written months ago is the one most likely to need correcting. */
  async function updateNote(id: string, note: string) {
    if (!supabase) return;
    const trimmed = note.trim() || null;
    setCosts((current) => current.map((cost) => (cost.id === id ? { ...cost, note: trimmed } : cost)));
    const { error: updateError } = await supabase.from("vehicle_costs").update({ note: trimmed }).eq("id", id);
    if (updateError) setError(updateError.message);
  }

  async function removeCost(id: string) {
    if (!supabase) return;
    const { error: deleteError } = await supabase.from("vehicle_costs").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    load();
  }

  const field =
    "focus-ring h-10 w-full rounded-xl border border-border bg-subtle px-3 text-label text-text-primary placeholder:text-text-tertiary";

  return (
    // Mileage links straight here, so the card needs an anchor and room above it
    // for the sticky page top not to swallow the heading it scrolls to.
    <section
      id="car-settings"
      className="scroll-mt-6 rounded-[20px] border border-border bg-surface p-3.5 shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-label font-semibold leading-tight text-text-primary">Car</h2>
      </div>

      {error ? (
        <p className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-meta text-warning">{error}</p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-micro font-medium uppercase tracking-[0.05em] text-text-tertiary">
            Miles per gallon
          </span>
          <input
            className={cn(field, "mt-1")}
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
          <span className="block text-micro font-medium uppercase tracking-[0.05em] text-text-tertiary">
            Fuel price per gallon
          </span>
          <input
            className={cn(field, "mt-1")}
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

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_110px_auto]">
        <DateField label="Date" value={costDate} onChange={setCostDate} />
        <label className="block">
          <span className="mb-2 block text-meta font-medium uppercase tracking-[0.04em] text-text-tertiary">Kind</span>
          <select
            className={cn(field, "h-11 font-medium")}
            value={costKind}
            onChange={(event) => setCostKind(event.target.value as VehicleCostKind)}
          >
            {VEHICLE_COST_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-meta font-medium uppercase tracking-[0.04em] text-text-tertiary">
            Amount
          </span>
          <input
            className={cn(field, "h-11")}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0.00"
            value={costAmount}
            onChange={(event) => setCostAmount(event.target.value)}
          />
        </label>
        <div className="flex items-end">
          <Button className="w-full sm:w-auto" variant="accent" onClick={addCost} disabled={saving || !costAmount}>
            Add
          </Button>
        </div>
      </div>
      <input
        aria-label="Note"
        className={cn(field, "mt-2")}
        placeholder="Note"
        value={costNote}
        onChange={(event) => setCostNote(event.target.value)}
      />

      {loading ? null : costs.length ? (
        <>
          <div className="mt-3 divide-y divide-border border-t border-border">
            {costs.map((cost) => (
              <div
                key={cost.id}
                className="grid grid-cols-[58px_84px_minmax(0,1fr)_74px_30px] items-center gap-2 py-2 text-list"
              >
                <span className="text-text-tertiary">
                  {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
                    new Date(`${cost.incurred_on}T12:00:00`)
                  )}
                </span>
                <span className="text-text-secondary">{cost.kind}</span>
                <input
                  aria-label="Note"
                  className="focus-ring min-w-0 rounded-lg bg-transparent px-1.5 py-1 text-list text-text-primary placeholder:text-text-tertiary hover:bg-subtle"
                  placeholder="Add a note"
                  defaultValue={cost.note ?? ""}
                  onBlur={(event) => {
                    if ((event.target.value.trim() || null) !== cost.note) updateNote(cost.id, event.target.value);
                  }}
                />
                <span className="text-right text-text-primary">{formatCurrency(cost.amount)}</span>
                <button
                  type="button"
                  aria-label="Delete cost"
                  className="focus-ring justify-self-end rounded-lg p-1.5 text-text-tertiary hover:bg-subtle hover:text-danger"
                  onClick={() => setDeletingCost(cost)}
                >
                  <Trash2 size={15} strokeWidth={1.7} />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-right text-meta text-text-tertiary">{formatCurrency(logged)} logged</p>
        </>
      ) : (
        <p className="mt-3 border-t border-border py-6 text-center text-list text-text-tertiary">
          Nothing logged. Fuel is worked out from the miles.
        </p>
      )}

      {deletingCost ? (
        <ConfirmDialog
          title={`Delete this ${deletingCost.kind.toLowerCase()} cost?`}
          description={`${formatCurrency(deletingCost.amount)} leaves the ledger, and what the car has taken back comes down by that much.`}
          confirmLabel="Delete it"
          onCancel={() => setDeletingCost(null)}
          onConfirm={() => {
            const target = deletingCost;
            setDeletingCost(null);
            void removeCost(target.id);
          }}
        />
      ) : null}
    </section>
  );
}

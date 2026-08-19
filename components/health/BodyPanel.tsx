"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { EmptyNote, NumberField, Panel, Stat, StatStrip, TrendChart } from "@/components/health/primitives";
import { formatShortDate, todayInputValue } from "@/lib/formatters";
import {
  ageFrom,
  bmi,
  bmiBand,
  latest,
  numberOrNull,
  previous,
  saveHealthEntry,
  saveHealthProfile,
  series
} from "@/lib/health";
import { MEASUREMENTS } from "@/types/health";
import type { HealthEntry, HealthProfile, MeasurementKey } from "@/types/health";

const EMPTY_FORM: Record<MeasurementKey, string> = {
  chest_in: "",
  waist_in: "",
  hips_in: "",
  arm_in: "",
  thigh_in: ""
};

function delta(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(1)}"`;
}

/**
 * The body itself: the fixed facts (height, age), and the tape measure.
 *
 * Measurements move when the scale does not — a waist can come in over a month
 * the weight sat still — so each one is shown next to its own last reading
 * rather than only as a current number.
 */
export function BodyPanel({
  personId,
  loggedBy,
  profile,
  entries,
  onSaved,
  onError
}: {
  personId: string;
  loggedBy: string;
  profile: HealthProfile | null;
  entries: HealthEntry[];
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [height, setHeight] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [form, setForm] = useState<Record<MeasurementKey, string>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [waistPoints, setWaistPoints] = useState(false);

  useEffect(() => {
    setHeight(profile?.height_in != null ? String(profile.height_in) : "");
    setBirthDate(profile?.birth_date ?? "");
  }, [profile]);

  const heightIn = profile?.height_in ?? null;
  const currentWeight = latest(entries, "weight_lb");
  const bmiValue = bmi(currentWeight?.value ?? null, heightIn);
  const age = ageFrom(profile?.birth_date ?? null);
  const waist = series(entries, "waist_in").slice(-24);

  async function saveProfile(patch: { height_in?: number | null; birth_date?: string | null }) {
    const { error } = await saveHealthProfile(personId, patch);
    if (error) {
      onError(error.message);
      return;
    }
    onSaved("Saved");
  }

  async function saveMeasurements() {
    const patch: Record<string, number | null> = {};
    MEASUREMENTS.forEach((measurement) => {
      const value = numberOrNull(form[measurement.key]);
      if (value != null) patch[measurement.key] = value;
    });

    if (!Object.keys(patch).length) {
      onError("Fill in at least one measurement.");
      return;
    }

    setSaving(true);
    const { error } = await saveHealthEntry(personId, date, patch, loggedBy);
    setSaving(false);
    if (error) {
      onError(error.message);
      return;
    }

    setForm(EMPTY_FORM);
    onSaved("Measurements saved");
  }

  return (
    <div className="space-y-3">
      <Panel title="The basics">
        <StatStrip columns="grid-cols-3">
          <Stat label="Height" value={heightIn ? `${heightIn}"` : "—"} detail={heightIn ? feetInches(heightIn) : "Set below"} />
          <Stat label="Age" value={age != null ? String(age) : "—"} detail={profile?.birth_date ? formatShortDate(profile.birth_date) : undefined} />
          <Stat
            label="BMI"
            value={bmiValue ? bmiValue.toFixed(1) : "—"}
            detail={bmiValue ? bmiBand(bmiValue) : "Needs height and a weigh-in"}
          />
        </StatStrip>

        <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-2">
          <NumberField
            label="Height (in)"
            value={height}
            onChange={setHeight}
            placeholder="70"
            step="0.5"
            onBlur={() => {
              if (height !== (heightIn != null ? String(heightIn) : "")) saveProfile({ height_in: numberOrNull(height) });
            }}
          />
          <DateField
            label="Date of birth"
            value={birthDate}
            dimFutureDates={false}
            onChange={(value) => {
              setBirthDate(value);
              if (value !== (profile?.birth_date ?? "")) saveProfile({ birth_date: value || null });
            }}
          />
        </div>
      </Panel>

      <Panel title="Measurements">
        {MEASUREMENTS.some((measurement) => latest(entries, measurement.key)) ? (
          <ul className="divide-y divide-border px-3 pb-2 pt-1">
            {MEASUREMENTS.map((measurement) => {
              const current = latest(entries, measurement.key);
              const before = previous(entries, measurement.key);
              const change = current && before ? current.value - before.value : null;
              return (
                <li key={measurement.key} className="flex items-center gap-3 py-2.5">
                  <span className="w-16 shrink-0 text-[13px] text-text-secondary">{measurement.label}</span>
                  <span className="text-[15px] font-medium text-text-primary">
                    {current ? `${current.value.toFixed(1)}"` : "—"}
                  </span>
                  {change != null ? (
                    <span
                      className={
                        change < 0 ? "text-[12px] text-success" : change > 0 ? "text-[12px] text-danger" : "text-[12px] text-text-tertiary"
                      }
                    >
                      {delta(change)}
                    </span>
                  ) : null}
                  <span className="ml-auto text-[12px] text-text-tertiary">
                    {current ? formatShortDate(current.date) : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyNote>No measurements yet. The form below starts the record.</EmptyNote>
        )}

        {waist.length > 1 ? (
          <div className="border-t border-border">
            <button
              type="button"
              className="focus-ring w-full px-3 pt-2 text-left text-[13px] font-medium text-text-secondary transition hover:text-text-primary"
              onClick={() => setWaistPoints((open) => !open)}
            >
              Waist over time {waistPoints ? "▾" : "▸"}
            </button>
            {waistPoints ? <TrendChart points={waist} unit="in" /> : <div className="pb-3" />}
          </div>
        ) : null}
      </Panel>

      <Panel title="Log measurements">
        <div className="px-3 pb-1 pt-2">
          <DateField label="Date" value={date} onChange={setDate} />
        </div>
        <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-2 sm:grid-cols-5">
          {MEASUREMENTS.map((measurement) => (
            <NumberField
              key={measurement.key}
              label={`${measurement.label} (in)`}
              value={form[measurement.key]}
              onChange={(value) => setForm((current) => ({ ...current, [measurement.key]: value }))}
            />
          ))}
        </div>
        <div className="px-3 pb-3">
          <Button variant="accent" onClick={saveMeasurements} disabled={saving}>
            {saving ? "Saving..." : "Save measurements"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function feetInches(value: number) {
  const feet = Math.floor(value / 12);
  const inches = Math.round(value - feet * 12);
  return `${feet}'${inches}"`;
}

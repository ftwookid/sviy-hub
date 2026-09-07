"use client";

import { useEffect, useState } from "react";
import { DateField } from "@/components/ui/DateField";
import { Block, Card, Hint, NumberField, Stat, StatStrip, TrendChart } from "@/components/health/primitives";
import { cn } from "@/lib/cn";
import { formatShortDate } from "@/lib/formatters";
import { ageFrom, bmi, bmiBand, latest, numberOrNull, previous, saveHealthProfile, series } from "@/lib/health";
import { MEASUREMENTS } from "@/types/health";
import type { HealthEntry, HealthProfile } from "@/types/health";

function delta(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(1)}"`;
}

function feetInches(value: number) {
  const feet = Math.floor(value / 12);
  const inches = Math.round(value - feet * 12);
  return `${feet}'${inches}"`;
}

/**
 * Stage two of the shape: BMI and the tape, each measurement against its own
 * last reading — a waist comes in over months the scale sits still.
 *
 * Height and date of birth are typed once in a lifetime, so they sit at the
 * bottom of a view reached on purpose rather than on the screen opened daily.
 */
export function BodyDetail({
  personId,
  profile,
  entries,
  onSaved,
  onError
}: {
  personId: string;
  profile: HealthProfile | null;
  entries: HealthEntry[];
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [height, setHeight] = useState("");
  const [birthDate, setBirthDate] = useState("");

  useEffect(() => {
    setHeight(profile?.height_in != null ? String(profile.height_in) : "");
    setBirthDate(profile?.birth_date ?? "");
  }, [profile]);

  const heightIn = profile?.height_in ?? null;
  const currentWeight = latest(entries, "weight_lb");
  const bmiValue = bmi(currentWeight?.value ?? null, heightIn);
  const age = ageFrom(profile?.birth_date ?? null);
  const waist = series(entries, "waist_in").slice(-40);
  const hasMeasurements = MEASUREMENTS.some((measurement) => latest(entries, measurement.key));

  async function saveProfile(patch: { height_in?: number | null; birth_date?: string | null }) {
    const { error } = await saveHealthProfile(personId, patch);
    if (error) {
      onError(error.message);
      return;
    }
    onSaved("Saved");
  }

  return (
    <Card>
      <Block>
        <StatStrip columns="grid-cols-3">
          <Stat label="Height" value={heightIn ? feetInches(heightIn) : "—"} detail={heightIn ? `${heightIn}"` : undefined} />
          <Stat
            label="Age"
            value={age != null ? String(age) : "—"}
            detail={profile?.birth_date ? formatShortDate(profile.birth_date) : undefined}
          />
          <Stat
            label="BMI"
            value={bmiValue ? bmiValue.toFixed(1) : "—"}
            detail={bmiValue ? bmiBand(bmiValue) : "Needs height and a weigh-in"}
          />
        </StatStrip>
      </Block>

      <Block>
        {hasMeasurements ? (
          <ul className="divide-y divide-border px-3">
            {MEASUREMENTS.map((measurement) => {
              const current = latest(entries, measurement.key);
              const before = previous(entries, measurement.key);
              const change = current && before ? current.value - before.value : null;
              return (
                <li key={measurement.key} className="flex items-center gap-3 py-2">
                  <span className="w-16 shrink-0 text-list text-text-secondary">{measurement.label}</span>
                  <span className="text-label font-medium text-text-primary">
                    {current ? `${current.value.toFixed(1)}"` : "—"}
                  </span>
                  {change != null ? (
                    <span
                      className={cn(
                        "text-meta",
                        change < 0 ? "text-success" : change > 0 ? "text-danger" : "text-text-tertiary"
                      )}
                    >
                      {delta(change)}
                    </span>
                  ) : null}
                  <span className="ml-auto text-meta text-text-tertiary">
                    {current ? formatShortDate(current.date) : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <Hint>No tape measurements yet — the ＋ on the overview takes them.</Hint>
        )}
        <TrendChart points={waist} unit="in" />
      </Block>

      <Block title="Height and date of birth">
        <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-1">
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
      </Block>
    </Card>
  );
}

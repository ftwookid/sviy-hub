"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { Block, Card, Disclosure, Hint, NumberField, Stat, StatStrip, TrendChart } from "@/components/health/primitives";
import { formatShortDate, todayInputValue } from "@/lib/formatters";
import { changeOver, deleteHealthEntry, latest, numberOrNull, saveHealthEntry, series, weeklyRate } from "@/lib/health";
import type { HealthEntry } from "@/types/health";

function signed(value: number, unit: string, digits = 1) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)} ${unit}`;
}

/**
 * The weigh-in log: what the scale says, and which way it has been going.
 *
 * Losing weight is a slope, not a reading, so the strip leads with the trend and
 * the latest number sits beside it. No heading says "Weight" — the tab does.
 */
export function WeightPanel({
  personId,
  loggedBy,
  entries,
  onSaved,
  onError
}: {
  personId: string;
  loggedBy: string;
  entries: HealthEntry[];
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [date, setDate] = useState(todayInputValue());
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [saving, setSaving] = useState(false);

  const current = latest(entries, "weight_lb");
  const weekChange = changeOver(entries, "weight_lb", 7);
  const monthChange = changeOver(entries, "weight_lb", 30);
  const rate = weeklyRate(entries);
  const points = series(entries, "weight_lb").slice(-24);
  const recent = [...entries].filter((entry) => entry.weight_lb != null).reverse().slice(0, 6);

  async function save() {
    const weightValue = numberOrNull(weight);
    const fatValue = numberOrNull(bodyFat);
    if (weightValue == null && fatValue == null) {
      onError("Enter a weight or a body fat reading.");
      return;
    }

    setSaving(true);
    const patch: Record<string, number | null> = {};
    if (weightValue != null) patch.weight_lb = weightValue;
    if (fatValue != null) patch.body_fat_pct = fatValue;

    const { error } = await saveHealthEntry(personId, date, patch, loggedBy);
    setSaving(false);
    if (error) {
      onError(error.message);
      return;
    }

    setWeight("");
    setBodyFat("");
    onSaved("Reading saved");
  }

  async function remove(id: string) {
    const { error } = await deleteHealthEntry(id);
    if (error) {
      onError(error.message);
      return;
    }
    onSaved("Reading deleted");
  }

  return (
    <Card>
      <Block>
        <StatStrip columns="grid-cols-3">
          <Stat
            label="Now"
            value={current ? `${current.value.toFixed(1)} lb` : "—"}
            detail={current ? formatShortDate(current.date) : "No readings yet"}
          />
          <Stat
            label="Per week"
            value={rate != null ? signed(rate, "lb") : "—"}
            detail={rate != null ? "4-week trend" : undefined}
            tone={rate == null ? undefined : rate < -0.05 ? "good" : rate > 0.05 ? "bad" : undefined}
          />
          <Stat
            label="30 days"
            value={monthChange != null ? signed(monthChange, "lb") : "—"}
            detail={weekChange != null ? `${signed(weekChange, "lb")} in 7 days` : undefined}
            tone={monthChange == null ? undefined : monthChange < 0 ? "good" : monthChange > 0 ? "bad" : undefined}
          />
        </StatStrip>
        <TrendChart points={points} unit="lb" />
        {!current ? <Hint>Nothing logged yet — the first weigh-in below starts the line.</Hint> : null}
      </Block>

      {/* Readings stay open: they are what the tab is for. */}
      {recent.length ? (
        <Block>
          <ul className="divide-y divide-border px-3">
            {recent.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-2">
                <span className="w-20 shrink-0 text-[12px] text-text-tertiary">
                  {formatShortDate(entry.recorded_on)}
                </span>
                <span className="text-[15px] font-medium text-text-primary">
                  {Number(entry.weight_lb).toFixed(1)} lb
                </span>
                {entry.body_fat_pct != null ? (
                  <span className="text-[12px] text-text-secondary">{Number(entry.body_fat_pct).toFixed(1)}% fat</span>
                ) : null}
                <button
                  type="button"
                  aria-label="Delete reading"
                  className="focus-ring ml-auto rounded-lg p-1.5 text-text-tertiary transition hover:bg-danger-soft hover:text-danger"
                  onClick={() => remove(entry.id)}
                >
                  <Trash2 size={16} strokeWidth={1.7} />
                </button>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      <Disclosure label="Log a weigh-in" defaultOpen={!current}>
        <div className="grid grid-cols-2 gap-2 px-3 pb-2 pt-1 sm:grid-cols-4">
          <div className="col-span-2">
            <DateField label="Date" value={date} onChange={setDate} />
          </div>
          <NumberField label="Weight (lb)" value={weight} onChange={setWeight} placeholder="178.4" />
          <NumberField label="Body fat %" value={bodyFat} onChange={setBodyFat} placeholder="22.5" />
        </div>
        <div className="px-3 pb-3">
          <Button variant="accent" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save reading"}
          </Button>
        </div>
      </Disclosure>
    </Card>
  );
}

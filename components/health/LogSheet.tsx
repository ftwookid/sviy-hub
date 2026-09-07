"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { NumberField, Sheet } from "@/components/health/primitives";
import { numberOrNull, saveHealthEntry } from "@/lib/health";
import { todayInputValue } from "@/lib/formatters";
import { MEASUREMENTS } from "@/types/health";
import type { MeasurementKey } from "@/types/health";

const EMPTY: Record<MeasurementKey, string> = {
  chest_in: "",
  waist_in: "",
  hips_in: "",
  arm_in: "",
  thigh_in: ""
};

/**
 * The full reading, for the once-a-week tape measure or a day caught up late.
 *
 * It opens on the two fields that get used and keeps the five that do not
 * behind one line, because a sheet of eight number inputs reads as a chore even
 * when six of them are optional. Anything left blank stays blank — a missing
 * measurement is not a zero.
 */
export function LogSheet({
  personId,
  loggedBy,
  onClose,
  onSaved,
  onError
}: {
  personId: string;
  loggedBy: string;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [date, setDate] = useState(todayInputValue());
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [tape, setTape] = useState<Record<MeasurementKey, string>>(EMPTY);
  const [tapeOpen, setTapeOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    const patch: Record<string, number | null> = {};
    const weightValue = numberOrNull(weight);
    const fatValue = numberOrNull(bodyFat);
    if (weightValue != null) patch.weight_lb = weightValue;
    if (fatValue != null) patch.body_fat_pct = fatValue;
    MEASUREMENTS.forEach((measurement) => {
      const value = numberOrNull(tape[measurement.key]);
      if (value != null) patch[measurement.key] = value;
    });

    if (!Object.keys(patch).length) {
      onError("Fill in at least one reading.");
      return;
    }

    setSaving(true);
    const { error } = await saveHealthEntry(personId, date, patch, loggedBy);
    setSaving(false);
    if (error) {
      onError(error.message);
      return;
    }

    onSaved("Reading saved");
    onClose();
  }

  return (
    <Sheet title="Log a reading" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="col-span-2">
          <DateField label="Date" value={date} onChange={setDate} />
        </div>
        <NumberField label="Weight (lb)" value={weight} onChange={setWeight} placeholder="178.4" />
        <NumberField label="Body fat %" value={bodyFat} onChange={setBodyFat} placeholder="22.5" />
      </div>

      <button
        type="button"
        aria-expanded={tapeOpen}
        onClick={() => setTapeOpen((open) => !open)}
        className="focus-ring mt-3 flex min-h-10 w-full items-center text-left text-list font-medium text-text-secondary transition-colors duration-200 ease-out hover:text-text-primary"
      >
        {tapeOpen ? "Hide tape measurements" : "Add tape measurements"}
      </button>

      {tapeOpen ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MEASUREMENTS.map((measurement) => (
            <NumberField
              key={measurement.key}
              label={`${measurement.label} (in)`}
              value={tape[measurement.key]}
              onChange={(value) => setTape((current) => ({ ...current, [measurement.key]: value }))}
            />
          ))}
        </div>
      ) : null}

      <Button variant="accent" className="mt-3 w-full" onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save reading"}
      </Button>
    </Sheet>
  );
}

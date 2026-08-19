"use client";

import { useEffect, useState } from "react";
import { DateField } from "@/components/ui/DateField";
import { Block, Card, Hint, NumberField, Stat, StatStrip, TrendChart } from "@/components/health/primitives";
import { cn } from "@/lib/cn";
import { formatShortDate, todayInputValue } from "@/lib/formatters";
import {
  changeOver,
  daysBetween,
  fatMass,
  first,
  goalProgress,
  latest,
  leanMass,
  numberOrNull,
  projectedGoalDate,
  saveHealthProfile,
  series,
  weeklyRate
} from "@/lib/health";
import type { HealthEntry, HealthProfile } from "@/types/health";

function signed(value: number, unit: string, digits = 1) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)} ${unit}`;
}

/**
 * Stage two of the goal: where the run started, where it is, and whether the
 * current pace actually arrives on the date that was set.
 *
 * The projection stays silent when the trend is flat or rising — a date
 * computed off a gaining fortnight is a made-up number, and this page states
 * figures rather than asserting conclusions.
 */
export function GoalDetail({
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
  const [goalWeight, setGoalWeight] = useState("");
  const [goalDate, setGoalDate] = useState("");

  useEffect(() => {
    setGoalWeight(profile?.goal_weight_lb != null ? String(profile.goal_weight_lb) : "");
    setGoalDate(profile?.goal_date ?? "");
  }, [profile]);

  const goal = profile?.goal_weight_lb ?? null;
  const start = first(entries, "weight_lb");
  const current = latest(entries, "weight_lb");
  const rate = weeklyRate(entries);
  const progress = goalProgress(start?.value ?? null, current?.value ?? null, goal);
  const toGo = current && goal != null ? current.value - goal : null;
  const projected = projectedGoalDate(current?.value ?? null, goal, rate);
  const lost = start && current ? current.value - start.value : null;

  const bodyFat = latest(entries, "body_fat_pct");
  const fatChange = changeOver(entries, "body_fat_pct", 90);
  const fat = fatMass(current?.value ?? null, bodyFat?.value ?? null);
  const lean = leanMass(current?.value ?? null, bodyFat?.value ?? null);
  const fatPoints = series(entries, "body_fat_pct").slice(-40);

  const requiredRate = (() => {
    if (!profile?.goal_date || toGo == null || toGo <= 0) return null;
    const days = daysBetween(todayInputValue(), profile.goal_date);
    if (days <= 0) return null;
    return -toGo / (days / 7);
  })();

  async function save(patch: { goal_weight_lb?: number | null; goal_date?: string | null }) {
    const { error } = await saveHealthProfile(personId, patch);
    if (error) {
      onError(error.message);
      return;
    }
    onSaved("Goal saved");
  }

  return (
    <Card>
      <Block>
        <StatStrip columns="grid-cols-3">
          <Stat
            label="To go"
            value={toGo != null ? `${Math.max(0, toGo).toFixed(1)} lb` : "—"}
            detail={goal != null ? `Goal ${goal} lb` : undefined}
            tone={toGo != null && toGo <= 0 ? "good" : undefined}
          />
          <Stat
            label="Lost so far"
            value={lost != null ? signed(-lost, "lb") : "—"}
            detail={start ? `Since ${formatShortDate(start.date)}` : undefined}
            tone={lost == null ? undefined : lost < 0 ? "good" : lost > 0 ? "bad" : undefined}
          />
          <Stat
            label="On track for"
            value={projected ? formatShortDate(projected) : "—"}
            detail={rate != null ? `At ${signed(rate, "lb")}/wk` : undefined}
          />
        </StatStrip>

        {progress != null ? (
          <div className="px-3 pb-3 pt-2">
            <div className="h-2.5 overflow-hidden rounded-full bg-subtle">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, progress * 100)}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-text-tertiary">
              <span>{start ? `${start.value.toFixed(1)} lb start` : ""}</span>
              <span>{Math.round(progress * 100)}% of the way</span>
              <span>{goal != null ? `${goal} lb goal` : ""}</span>
            </div>
          </div>
        ) : (
          <Hint>Set a goal weight below and the progress bar fills in.</Hint>
        )}

        {requiredRate != null && profile?.goal_date ? (
          <p className="px-3 pb-3 text-[12px] text-text-secondary">
            {formatShortDate(profile.goal_date)} needs{" "}
            <span className="font-medium text-text-primary">{signed(requiredRate, "lb")}</span> a week.
            {rate != null ? (
              <span className={cn("ml-1", rate <= requiredRate ? "text-success" : "text-danger")}>
                Pace {signed(rate, "lb")}.
              </span>
            ) : null}
          </p>
        ) : null}
      </Block>

      <Block>
        <StatStrip columns="grid-cols-3">
          <Stat
            label="Body fat"
            value={bodyFat ? `${bodyFat.value.toFixed(1)}%` : "—"}
            detail={bodyFat ? formatShortDate(bodyFat.date) : undefined}
          />
          <Stat
            label="Fat mass"
            value={fat != null ? `${fat.toFixed(1)} lb` : "—"}
            detail={fatChange != null ? `${signed(fatChange, "pt")} in 90 days` : undefined}
            tone={fatChange == null ? undefined : fatChange < 0 ? "good" : fatChange > 0 ? "bad" : undefined}
          />
          <Stat label="Lean mass" value={lean != null ? `${lean.toFixed(1)} lb` : "—"} />
        </StatStrip>
        <TrendChart points={fatPoints} unit="%" />
      </Block>

      <Block title="The goal">
        <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-1">
          <NumberField
            label="Goal weight (lb)"
            value={goalWeight}
            onChange={setGoalWeight}
            placeholder="165"
            onBlur={() => {
              if (goalWeight !== (goal != null ? String(goal) : "")) save({ goal_weight_lb: numberOrNull(goalWeight) });
            }}
          />
          <DateField
            label="Target date"
            value={goalDate}
            dimFutureDates={false}
            onChange={(value) => {
              setGoalDate(value);
              if (value !== (profile?.goal_date ?? "")) save({ goal_date: value || null });
            }}
          />
        </div>
      </Block>
    </Card>
  );
}

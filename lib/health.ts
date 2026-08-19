import { supabase } from "@/lib/supabase";
import { parseLocalDate, toInputDate } from "@/lib/formatters";
import type { HealthEntry, HealthProfile } from "@/types/health";

/** Columns a reading can carry a number in. */
export type MetricKey =
  | "weight_lb"
  | "body_fat_pct"
  | "waist_in"
  | "chest_in"
  | "hips_in"
  | "arm_in"
  | "thigh_in";

export type Reading = { date: string; value: number };

/**
 * A blank field means "not measured today", not zero. Weighing without getting
 * the tape out is the normal case, so an empty box has to leave the last
 * measurement standing rather than write a 0 that would tank every trend.
 */
export function numberOrNull(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Every reading that actually has this metric, oldest first. */
export function series(entries: HealthEntry[], key: MetricKey): Reading[] {
  return entries
    .filter((entry) => entry[key] != null)
    .map((entry) => ({ date: entry.recorded_on, value: Number(entry[key]) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function latest(entries: HealthEntry[], key: MetricKey): Reading | null {
  const points = series(entries, key);
  return points.length ? points[points.length - 1] : null;
}

export function previous(entries: HealthEntry[], key: MetricKey): Reading | null {
  const points = series(entries, key);
  return points.length > 1 ? points[points.length - 2] : null;
}

export function first(entries: HealthEntry[], key: MetricKey): Reading | null {
  const points = series(entries, key);
  return points.length ? points[0] : null;
}

export function daysBetween(from: string, to: string) {
  return Math.round((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / 86_400_000);
}

/**
 * Change over a window, measured between the newest reading and the oldest one
 * still inside it — not against a fixed calendar date, which would report "no
 * change" for anyone who skipped a week.
 */
export function changeOver(entries: HealthEntry[], key: MetricKey, days: number): number | null {
  const points = series(entries, key);
  if (points.length < 2) return null;

  const newest = points[points.length - 1];
  const cutoff = daysAgoInput(days, newest.date);
  const inWindow = points.filter((point) => point.date >= cutoff);
  const oldest = inWindow.length > 1 ? inWindow[0] : points[points.length - 2];
  return newest.value - oldest.value;
}

function daysAgoInput(days: number, fromDate: string) {
  const date = parseLocalDate(fromDate);
  date.setDate(date.getDate() - days);
  return toInputDate(date);
}

/**
 * Pounds per week, as a least-squares slope over the recent window rather than
 * first-minus-last. Weight swings a couple of pounds on water alone, so two
 * endpoints can say "gaining" through a month that plainly trended down.
 */
export function weeklyRate(entries: HealthEntry[], key: MetricKey = "weight_lb", days = 28): number | null {
  const points = series(entries, key);
  if (points.length < 2) return null;

  const newest = points[points.length - 1];
  const cutoff = daysAgoInput(days, newest.date);
  const window = points.filter((point) => point.date >= cutoff);
  const used = window.length >= 2 ? window : points.slice(-2);

  const xs = used.map((point) => daysBetween(used[0].date, point.date));
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanY = used.reduce((sum, point) => sum + point.value, 0) / used.length;

  let top = 0;
  let bottom = 0;
  used.forEach((point, index) => {
    top += (xs[index] - meanX) * (point.value - meanY);
    bottom += (xs[index] - meanX) ** 2;
  });
  if (!bottom) return null;

  return (top / bottom) * 7;
}

export function bmi(weightLb: number | null, heightIn: number | null): number | null {
  if (!weightLb || !heightIn) return null;
  return (703 * weightLb) / heightIn ** 2;
}

/** The standard NIH bands, so the number comes with the word for it. */
export function bmiBand(value: number) {
  if (value < 18.5) return "Underweight";
  if (value < 25) return "Normal";
  if (value < 30) return "Overweight";
  return "Obese";
}

export function fatMass(weightLb: number | null, bodyFatPct: number | null): number | null {
  if (!weightLb || bodyFatPct == null) return null;
  return (weightLb * bodyFatPct) / 100;
}

export function leanMass(weightLb: number | null, bodyFatPct: number | null): number | null {
  const fat = fatMass(weightLb, bodyFatPct);
  if (fat == null || !weightLb) return null;
  return weightLb - fat;
}

export function ageFrom(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const born = parseLocalDate(birthDate);
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const beforeBirthday =
    today.getMonth() < born.getMonth() || (today.getMonth() === born.getMonth() && today.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/**
 * When the goal lands at the rate actually being lost. Null when there is no
 * goal, when it is already met, or when the trend is going the wrong way —
 * an arrival date computed off a gaining week is a fiction.
 */
export function projectedGoalDate(current: number | null, goal: number | null, rate: number | null): string | null {
  if (current == null || goal == null || rate == null) return null;
  const remaining = current - goal;
  if (remaining <= 0) return null;
  if (rate >= -0.05) return null;

  const weeks = remaining / Math.abs(rate);
  if (!Number.isFinite(weeks) || weeks > 520) return null;

  const date = new Date();
  date.setDate(date.getDate() + Math.round(weeks * 7));
  return toInputDate(date);
}

/** How far along the run from the first weigh-in to the goal, 0–1. */
export function goalProgress(start: number | null, current: number | null, goal: number | null): number | null {
  if (start == null || current == null || goal == null) return null;
  const total = start - goal;
  if (Math.abs(total) < 0.01) return null;
  return Math.min(1, Math.max(0, (start - current) / total));
}

export function isMissingTable(message: string) {
  return /does not exist|schema cache/i.test(message);
}

export async function loadHealthProfiles() {
  if (!supabase) return { profiles: [] as HealthProfile[], error: null };
  const { data, error } = await supabase.from("health_profiles").select("*");
  return { profiles: (data ?? []) as HealthProfile[], error };
}

export async function loadHealthEntries() {
  if (!supabase) return { entries: [] as HealthEntry[], error: null };
  const { data, error } = await supabase
    .from("health_entries")
    .select("*")
    .order("recorded_on", { ascending: true });
  return { entries: (data ?? []) as HealthEntry[], error };
}

export async function saveHealthProfile(personId: string, patch: Partial<HealthProfile>) {
  if (!supabase) return { error: null };
  const { error } = await supabase
    .from("health_profiles")
    .upsert({ person_id: personId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "person_id" });
  return { error };
}

/**
 * One row per person per day, so a morning weigh-in and an evening tape measure
 * land on the same reading instead of two half-filled ones.
 */
export async function saveHealthEntry(
  personId: string,
  recordedOn: string,
  patch: Partial<Record<MetricKey, number | null>> & { note?: string | null },
  loggedBy: string
) {
  if (!supabase) return { error: null };
  const { error } = await supabase
    .from("health_entries")
    .upsert(
      { person_id: personId, recorded_on: recordedOn, logged_by: loggedBy, ...patch },
      { onConflict: "person_id,recorded_on" }
    );
  return { error };
}

export async function deleteHealthEntry(id: string) {
  if (!supabase) return { error: null };
  const { error } = await supabase.from("health_entries").delete().eq("id", id);
  return { error };
}

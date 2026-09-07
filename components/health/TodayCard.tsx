"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { PersonMenu, type Person } from "@/components/health/PersonMenu";
import { Sparkline } from "@/components/health/primitives";
import { daysAgo } from "@/lib/formatters";
import { latest, numberOrNull, saveHealthEntry, series, weeklyRate } from "@/lib/health";
import type { HealthEntry } from "@/types/health";

function signed(value: number, digits = 1) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}`;
}

/**
 * The one thing this page is opened to do.
 *
 * Nine visits in ten are a weigh-in: unlock the phone, type one number, put it
 * down. So the number field is the first thing on the screen with the keyboard
 * one tap away — not behind a tab, a disclosure and a Save button, which is what
 * the tabbed version cost.
 *
 * The card is written by its own state rather than by navigation: until today
 * has a reading it is an input asking for one, and the moment it does it becomes
 * the reading, with the trend beside it. That is also the answer to "have I
 * weighed in yet?", which no separate label has to state.
 */
export function TodayCard({
  personId,
  loggedBy,
  today,
  entries,
  people,
  personLabel,
  onSelectPerson,
  onSaved,
  onError,
  onOpenHistory,
  onOpenLog
}: {
  personId: string;
  loggedBy: string;
  today: string;
  entries: HealthEntry[];
  people: Person[];
  personLabel: string | null;
  onSelectPerson: (id: string) => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
  onOpenHistory: () => void;
  onOpenLog: () => void;
}) {
  const todayEntry = entries.find((entry) => entry.recorded_on === today && entry.weight_lb != null);
  const current = latest(entries, "weight_lb");
  const previousReading = series(entries, "weight_lb").filter((point) => point.date !== today).slice(-1)[0] ?? null;
  const rate = weeklyRate(entries);
  const trend = series(entries, "weight_lb").slice(-14);

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    const weight = numberOrNull(value);
    if (weight == null) {
      setEditing(false);
      setValue("");
      return;
    }

    setSaving(true);
    const { error } = await saveHealthEntry(personId, today, { weight_lb: weight }, loggedBy);
    setSaving(false);
    if (error) {
      onError(error.message);
      return;
    }

    setValue("");
    setEditing(false);
    onSaved("Weighed in");
  }

  const change = todayEntry && previousReading ? Number(todayEntry.weight_lb) - previousReading.value : null;
  const showInput = editing || !todayEntry;

  return (
    <section className="rounded-[16px] border border-border bg-surface">
      <div className="flex items-center gap-3 px-3 py-3">
        {showInput ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <input
              ref={inputRef}
              // `input-display` is not a utility — it is the opt-out from the 16px
              // phone floor in globals.css, which every other field wants and this
              // one would be shrunk by.
              className="focus-ring input-display w-[124px] shrink-0 rounded-xl border border-border bg-subtle px-3 py-2 text-display-sm font-semibold leading-none tracking-[-0.01em] text-text-primary placeholder:text-text-tertiary/70"
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              aria-label="Today's weight in pounds"
              placeholder={current ? current.value.toFixed(1) : "178.4"}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
                if (event.key === "Escape" && todayEntry) {
                  setEditing(false);
                  setValue("");
                }
              }}
            />
            <span className="text-body text-text-tertiary">lb</span>
            {value ? (
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="focus-ring ml-auto rounded-xl bg-accent px-3.5 py-2 text-body font-medium text-text-primary transition-colors duration-200 ease-out hover:bg-[#BE9E62]"
              >
                {saving ? "..." : "Save"}
              </button>
            ) : (
              <span className="ml-auto truncate text-right text-meta text-text-tertiary">
                {current ? `Last ${current.value.toFixed(1)} · ${daysAgo(current.date).toLowerCase()}` : "First weigh-in"}
              </span>
            )}
          </div>
        ) : (
          // Logged: the same row now reads back what it collected, and tapping
          // it puts the field back — a correction is the only reason to return.
          <button
            type="button"
            onClick={() => {
              setValue(String(todayEntry?.weight_lb ?? ""));
              setEditing(true);
            }}
            className="focus-ring flex min-w-0 flex-1 items-baseline gap-2 text-left"
          >
            <span className="text-display font-semibold leading-none tracking-[-0.02em] text-text-primary">
              {Number(todayEntry?.weight_lb).toFixed(1)}
            </span>
            <span className="text-body text-text-tertiary">
              lb{personLabel ? ` · ${personLabel}` : ""} today
            </span>
            {change != null ? (
              <span
                className={cn(
                  "text-list",
                  change < 0 ? "text-success" : change > 0 ? "text-danger" : "text-text-tertiary"
                )}
              >
                {signed(change)}
              </span>
            ) : null}
          </button>
        )}

        {/* Whose body this is rides in the same row as ＋, so context costs no
            height. Tapping it opens the list rather than swapping silently. */}
        <PersonMenu people={people} personId={personId} onSelect={onSelectPerson} />

        {/* Everything else a reading can carry — tape, body fat, a day missed —
            is one tap away rather than five more fields nobody fills daily. */}
        <button
          type="button"
          onClick={onOpenLog}
          aria-label="Log more"
          className="focus-ring shrink-0 rounded-xl border border-border bg-subtle p-2 text-text-secondary transition-colors duration-200 ease-out hover:border-border-emphasis hover:text-text-primary"
        >
          <Plus size={18} strokeWidth={1.8} />
        </button>
      </div>

      {trend.length > 1 ? (
        <button
          type="button"
          onClick={onOpenHistory}
          className="focus-ring flex w-full items-center gap-3 border-t border-border px-3 py-2.5 text-left transition-colors duration-200 ease-out hover:bg-subtle/50"
        >
          <Sparkline points={trend} />
          <span className="min-w-0 flex-1 truncate text-list text-text-secondary">
            {rate != null ? (
              <>
                <span className={cn("font-medium", rate < -0.05 ? "text-success" : rate > 0.05 ? "text-danger" : "")}>
                  {signed(rate)} lb
                </span>{" "}
                a week
              </>
            ) : (
              "Trend builds with the next weigh-in"
            )}
          </span>
          <ChevronRight size={16} strokeWidth={1.7} className="shrink-0 text-text-tertiary" />
        </button>
      ) : null}
    </section>
  );
}

"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Block, Card, Hint, Stat, StatStrip, TrendChart } from "@/components/health/primitives";
import { formatDateWithYear, formatShortDate } from "@/lib/formatters";
import { changeOver, deleteHealthEntry, latest, series, weeklyRate } from "@/lib/health";
import type { HealthEntry } from "@/types/health";

function signed(value: number, unit: string, digits = 1) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)} ${unit}`;
}

/**
 * Stage two of the weigh-in: the whole run of readings, with the delete that
 * fixes a fat-fingered entry. Entry itself belongs on the overview, so nothing
 * here is a form.
 */
export function WeightDetail({
  entries,
  onSaved,
  onError
}: {
  entries: HealthEntry[];
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const current = latest(entries, "weight_lb");
  const weekChange = changeOver(entries, "weight_lb", 7);
  const monthChange = changeOver(entries, "weight_lb", 30);
  const rate = weeklyRate(entries);
  const points = series(entries, "weight_lb");
  const history = [...entries].filter((entry) => entry.weight_lb != null).reverse();
  // A trash icon on every row of a list is one mis-tap from losing a weigh-in
  // that cannot be taken again — yesterday's morning is gone. So it asks, and
  // the question names the day and the figure, which is what the reader needs
  // to tell one row of a long column of similar numbers from the next.
  const [deleting, setDeleting] = useState<HealthEntry | null>(null);

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
            detail={current ? formatShortDate(current.date) : undefined}
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
        <TrendChart points={points.slice(-40)} unit="lb" />
      </Block>

      <Block>
        {history.length ? (
          <ul className="divide-y divide-border px-3">
            {history.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-2">
                <span className="w-20 shrink-0 text-meta text-text-tertiary">
                  {formatShortDate(entry.recorded_on)}
                </span>
                <span className="text-label font-medium text-text-primary">
                  {Number(entry.weight_lb).toFixed(1)} lb
                </span>
                {entry.body_fat_pct != null ? (
                  <span className="text-meta text-text-secondary">{Number(entry.body_fat_pct).toFixed(1)}% fat</span>
                ) : null}
                <button
                  type="button"
                  aria-label="Delete reading"
                  className="focus-ring ml-auto rounded-lg p-1.5 text-text-tertiary transition-colors duration-200 ease-out hover:bg-danger-soft hover:text-danger"
                  onClick={() => setDeleting(entry)}
                >
                  <Trash2 size={16} strokeWidth={1.7} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Hint>No weigh-ins yet.</Hint>
        )}
      </Block>

      {deleting ? (
        <ConfirmDialog
          title="Delete this reading?"
          description={`${Number(deleting.weight_lb).toFixed(1)} lb from ${formatDateWithYear(deleting.recorded_on)} leaves the history, and the trend is refitted without it.`}
          confirmLabel="Delete it"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const target = deleting;
            setDeleting(null);
            void remove(target.id);
          }}
        />
      ) : null}
    </Card>
  );
}

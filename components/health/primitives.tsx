"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatShortDate } from "@/lib/formatters";
import type { Reading } from "@/lib/health";

/** Same strip the Mileage page uses: numbers side by side, one set of chrome. */
export function Stat({
  label,
  value,
  detail,
  tone
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="min-w-0 px-3 py-2.5 first:pl-0 last:pr-0">
      <div className="truncate text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-[21px] font-medium leading-none tracking-[-0.01em]",
          tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-text-primary"
        )}
      >
        {value}
      </div>
      {detail ? <div className="mt-1 truncate text-[12px] text-text-tertiary">{detail}</div> : null}
    </div>
  );
}

export function StatStrip({ children, columns }: { children: ReactNode; columns: string }) {
  return <div className={cn("mt-1 grid divide-x divide-border px-3", columns)}>{children}</div>;
}

export function Panel({
  title,
  action,
  children
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[16px] border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 pt-3">
        <h2 className="text-[14px] font-medium leading-tight text-text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const healthField =
  "focus-ring h-10 w-full rounded-xl border border-border bg-subtle px-3 text-[15px] text-text-primary placeholder:text-text-tertiary";

export function NumberField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  step = "0.1"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium uppercase tracking-[0.05em] text-text-tertiary">{label}</span>
      <input
        className={cn(healthField, "mt-1")}
        type="number"
        step={step}
        min="0"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
    </label>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="px-3 pb-3 pt-2 text-[13px] text-text-secondary">{children}</p>;
}

/**
 * Readings plotted as a line, not bars.
 *
 * A body weight bar chart from a zero baseline is five identical columns — the
 * whole story lives in the two pounds between them, so the scale is fitted to
 * the readings rather than to zero, and the axis says which range it covers so
 * nobody reads a wobble as a collapse.
 */
export function TrendChart({
  points,
  unit,
  format = (value: number) => value.toFixed(1)
}: {
  points: Reading[];
  unit: string;
  format?: (value: number) => string;
}) {
  if (points.length < 2) {
    return (
      <p className="px-3 pb-3 pt-2 text-[13px] text-text-secondary">
        Two readings draw a line — log another and the trend shows up here.
      </p>
    );
  }

  const width = 320;
  const height = 110;
  const padY = 12;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = padY + (1 - (point.value - min) / span) * (height - padY * 2);
    return { ...point, x, y };
  });

  const line = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${line} ${width},${height} 0,${height}`;
  const last = coords[coords.length - 1];

  return (
    <div className="px-3 pb-3 pt-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full" preserveAspectRatio="none" role="img">
        <polygon points={area} fill="rgba(200,168,110,0.16)" />
        <polyline
          points={line}
          fill="none"
          stroke="#C8A86E"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={last.x} cy={last.y} r="3" fill="#C8A86E" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex items-baseline justify-between text-[11px] text-text-tertiary">
        <span>
          {formatShortDate(points[0].date)} · {format(min)}–{format(max)} {unit}
        </span>
        <span className="text-text-secondary">
          {formatShortDate(last.date)} · {format(last.value)} {unit}
        </span>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatShortDate } from "@/lib/formatters";
import type { Reading } from "@/lib/health";

/** Numbers side by side, one set of chrome — never a grid of stat cards. */
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
      {/* No reserved-but-empty line: a detail that has nothing to say takes no height. */}
      {detail ? <div className="mt-1 truncate text-[12px] text-text-tertiary">{detail}</div> : null}
    </div>
  );
}

export function StatStrip({ children, columns }: { children: ReactNode; columns: string }) {
  return <div className={cn("grid divide-x divide-border px-3 pt-1", columns)}>{children}</div>;
}

/**
 * One container per screen. Each tab's blocks are `Block`s divided by a rule
 * inside this, not separate cards — a card costs a border, a shadow, a title
 * and two lots of padding, and three of them stacked is most of a phone screen
 * spent on chrome.
 */
export function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-[16px] border border-border bg-surface">{children}</section>;
}

export function Block({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="border-t border-border first:border-t-0">
      {title ? (
        <h2 className="px-3 pt-3 text-[13px] font-medium leading-tight text-text-primary">{title}</h2>
      ) : null}
      {children}
    </div>
  );
}

/**
 * Typing is rare, reading is constant, so every form on this page starts closed.
 * What the page exists to show is never behind a click; what it exists to
 * collect always is.
 */
export function Disclosure({
  label,
  children,
  defaultOpen = false
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="focus-ring flex min-h-10 w-full items-center gap-1.5 px-3 text-left text-[13px] font-medium text-text-secondary transition hover:text-text-primary"
      >
        {label}
        <ChevronDown size={15} strokeWidth={1.8} className={cn("transition", open ? "rotate-180" : "")} />
      </button>
      {open ? children : null}
    </div>
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

export function Hint({ children }: { children: ReactNode }) {
  return <p className="px-3 py-2.5 text-[13px] text-text-secondary">{children}</p>;
}

/**
 * Readings plotted as a line, not bars.
 *
 * A body weight bar chart from a zero baseline is five identical columns — the
 * whole story lives in the two pounds between them, so the scale is fitted to
 * the readings, and the axis line underneath says which range it covers so a
 * wobble is not read as a collapse. That axis doubles as the caption, which is
 * why the chart carries no separate title.
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
  if (points.length < 2) return null;

  const width = 320;
  const height = 96;
  const padY = 10;
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
  const last = coords[coords.length - 1];

  return (
    <div className="px-3 pb-3 pt-1.5">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full" preserveAspectRatio="none" role="img">
        <polygon points={`${line} ${width},${height} 0,${height}`} fill="rgba(200,168,110,0.16)" />
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

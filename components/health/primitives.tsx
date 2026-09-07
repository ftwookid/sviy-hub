"use client";

import type { ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";
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
      <div className="truncate text-caption font-medium uppercase tracking-[0.05em] text-text-tertiary">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-figure font-semibold leading-none tracking-[-0.01em]",
          tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-text-primary"
        )}
      >
        {value}
      </div>
      {detail ? <div className="mt-1 truncate text-meta text-text-tertiary">{detail}</div> : null}
    </div>
  );
}

export function StatStrip({ children, columns }: { children: ReactNode; columns: string }) {
  return <div className={cn("grid divide-x divide-border px-3 pt-1", columns)}>{children}</div>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-[16px] border border-border bg-surface", className)}>{children}</section>;
}

export function Block({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="border-t border-border first:border-t-0">
      {title ? <h2 className="px-3 pt-3 text-list font-semibold leading-tight text-text-primary">{title}</h2> : null}
      {children}
    </div>
  );
}

/**
 * A tile is a question, and tapping it is how you get the long answer.
 *
 * The overview carries one line per thing the reader might wonder about; the
 * chart, the history and the form that belong to it live one tap away instead of
 * competing for the same screen. Nothing here is decoration — every tile is a
 * button.
 */
export function Tile({
  label,
  value,
  detail,
  tone,
  accessory,
  onClick
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "good" | "bad";
  accessory?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring group flex min-w-0 items-center gap-2 px-3 py-2.5 text-left transition-colors duration-200 ease-out hover:bg-subtle/50"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption font-medium uppercase tracking-[0.05em] text-text-tertiary">
          {label}
        </span>
        <span
          className={cn(
            "mt-1.5 block truncate text-figure font-semibold leading-none tracking-[-0.01em]",
            tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-text-primary"
          )}
        >
          {value}
        </span>
        {detail ? <span className="mt-1 block truncate text-meta text-text-tertiary">{detail}</span> : null}
      </span>
      {accessory}
    </button>
  );
}

/**
 * Stage two. The back arrow is the only navigation a detail view needs.
 *
 * It stands in the same slot as `PageHeader`, at the same 44px height and with
 * the same gap under it, so stepping into Goal or Body does not nudge the
 * content below by a few pixels.
 */
export function DetailHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mb-4 flex min-h-11 items-center gap-1">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="focus-ring -ml-2 rounded-xl p-2 text-text-secondary transition-colors duration-200 ease-out hover:bg-subtle hover:text-text-primary"
      >
        <ChevronLeft size={20} strokeWidth={1.8} />
      </button>
      <h1 className="text-subhead font-semibold leading-tight tracking-[-0.01em] text-text-primary">{title}</h1>
    </div>
  );
}

/**
 * The house bottom sheet: everything rare goes in here rather than on the page.
 * Rises from the bottom on a phone, where thumbs are, and centres on a desktop.
 */
export function Sheet({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#1A1916]/25 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="sheet-panel flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-t-[28px] border border-border bg-page shadow-[0_-8px_40px_rgba(48,38,24,0.18)] sm:max-w-[460px] sm:rounded-[24px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-4">
          <h2 className="text-label font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring rounded-xl p-1.5 text-text-tertiary transition-colors duration-200 ease-out hover:bg-subtle hover:text-text-primary"
          >
            <X size={18} strokeWidth={1.7} />
          </button>
        </div>
        <div className="px-4 pb-[calc(16px+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

export const healthField =
  "focus-ring h-10 w-full rounded-xl border border-border bg-subtle px-3 text-label text-text-primary placeholder:text-text-tertiary";

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
      <span className="block text-micro font-medium uppercase tracking-[0.05em] text-text-tertiary">{label}</span>
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
  return <p className="px-3 py-2.5 text-list text-text-secondary">{children}</p>;
}

/** A trend small enough to sit inside a row: shape only, no axis, no labels. */
export function Sparkline({ points, className }: { points: Reading[]; className?: string }) {
  if (points.length < 2) return null;

  const width = 72;
  const height = 22;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const line = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = 2 + (1 - (point.value - min) / span) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("h-6 w-[72px] shrink-0", className)} aria-hidden>
      <polyline
        points={line}
        fill="none"
        stroke="#C8A86E"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Progress as a ring, because it fits in the corner of a tile a bar cannot. */
export function Ring({ progress }: { progress: number }) {
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0 -rotate-90" aria-hidden>
      <circle cx="16" cy="16" r={radius} fill="none" stroke="#EDE7DC" strokeWidth="3.5" />
      <circle
        cx="16"
        cy="16"
        r={radius}
        fill="none"
        stroke="#C8A86E"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={`${circumference * Math.min(1, Math.max(0, progress))} ${circumference}`}
      />
    </svg>
  );
}

/**
 * Readings plotted as a line, not bars.
 *
 * A body weight bar chart from a zero baseline is five identical columns — the
 * whole story lives in the two pounds between them, so the scale is fitted to
 * the readings, and the axis line underneath says which range it covers. That
 * axis doubles as the caption, which is why the chart carries no title.
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
      <div className="mt-1 flex items-baseline justify-between text-caption text-text-tertiary">
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

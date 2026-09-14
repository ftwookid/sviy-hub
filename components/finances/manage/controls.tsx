"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { AnchoredPanel } from "@/components/ui/AnchoredPanel";
import { EDITABLE_BUCKETS, SECTION_STYLE } from "@/lib/finances";
import type { FinanceBucket } from "@/types/finance";

/**
 * The controls the manage screen shares between its two editors.
 *
 * Both editors do the same four things — name the thing, say which block of the
 * month it lands in, save an amount, destroy something — so they wear the same
 * buttons. Having each editor grow its own was how the old panels ended up with
 * `ActionButton`, `IconButton` and `SquareButton` all meaning "44px square".
 */

export function parseAmount(value: string) {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/**
 * Save, Cancel, Delete — named, toned at rest.
 *
 * A phone has no hover, so a destructive button that only turns red when a
 * cursor is over it is, on the device this app is used on, the same button as
 * the one beside it.
 */
export function ActionButton({
  tone,
  disabled,
  onClick,
  className,
  children
}: {
  tone: "primary" | "quiet" | "danger";
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={cn(
        "focus-ring inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-body font-medium transition-colors duration-200 ease-out disabled:opacity-40 sm:px-4",
        tone === "primary"
          ? "bg-accent text-text-primary hover:brightness-95"
          : tone === "danger"
            ? "border border-danger/30 bg-danger-soft/50 text-danger hover:bg-danger-soft"
            : "border border-border bg-surface text-text-secondary hover:bg-subtle hover:text-text-primary",
        className
      )}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** A 44px square, for the actions that are unmistakable as an icon. */
export function IconButton({
  label,
  tone = "plain",
  disabled,
  className,
  onClick,
  children
}: {
  label: string;
  tone?: "plain" | "danger" | "accent";
  disabled?: boolean;
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={cn(
        "focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition-colors duration-200 ease-out disabled:opacity-40",
        tone === "danger"
          ? "border-danger/30 bg-danger-soft/50 text-danger hover:bg-danger-soft"
          : tone === "accent"
            ? "border-transparent bg-accent text-text-primary hover:brightness-95"
            : "border-border bg-surface text-text-secondary hover:bg-subtle hover:text-text-primary",
        className
      )}
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function AmountInput({
  value,
  onChange,
  label,
  onEnter,
  autoFocus,
  className
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  onEnter?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <input
      className={cn(
        "focus-ring min-h-11 w-full rounded-xl border border-border bg-subtle px-3 text-right text-label tabular-nums text-text-primary placeholder:text-text-tertiary",
        className
      )}
      value={value}
      aria-label={label}
      placeholder="0.00"
      inputMode="decimal"
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && onEnter) onEnter();
      }}
    />
  );
}

export function NameInput({
  value,
  onChange,
  onCommit,
  label,
  placeholder,
  autoFocus,
  className
}: {
  value: string;
  onChange: (next: string) => void;
  onCommit?: () => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <input
      className={cn(
        "focus-ring min-h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-label text-text-primary placeholder:text-text-tertiary",
        className
      )}
      value={value}
      aria-label={label}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

/**
 * Which block of the month this lands in, as a chip that shows the options.
 *
 * It is painted at rest rather than lighting up on hover: this is a control that
 * changes what a figure *means*, so on a phone — where there is no hover — it
 * has to look like one before it is touched.
 *
 * `allowed` narrows the list. A metered bill is never gross income, and offering
 * a choice that cannot be right is worse than offering none.
 */
export function BucketPicker({
  value,
  allowed = EDITABLE_BUCKETS,
  onChange,
  className
}: {
  value: FinanceBucket;
  allowed?: FinanceBucket[];
  onChange: (next: FinanceBucket) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        className={cn(
          "focus-ring inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-label font-medium text-text-primary transition-colors duration-200 ease-out hover:bg-subtle",
          className
        )}
        type="button"
        aria-label={`Counted in ${SECTION_STYLE[value].title} — change which block`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden className={cn("h-4 w-1.5 shrink-0 rounded-full", SECTION_STYLE[value].color)} />
        <span className="truncate">{SECTION_STYLE[value].title}</span>
        <ChevronDown size={15} strokeWidth={2} className="shrink-0 text-text-tertiary" />
      </button>

      <AnchoredPanel anchorRef={triggerRef} open={open} onClose={() => setOpen(false)} width={244} className="p-1.5">
        {allowed.map((bucket) => (
          <button
            key={bucket}
            className={cn(
              "focus-ring flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-body transition-colors duration-200 ease-out",
              bucket === value ? "bg-accent-soft text-text-primary" : "text-text-secondary hover:bg-subtle"
            )}
            type="button"
            onClick={() => {
              onChange(bucket);
              setOpen(false);
            }}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className={cn("h-3.5 w-1.5 shrink-0 rounded-full", SECTION_STYLE[bucket].color)} />
              <span className="truncate">{SECTION_STYLE[bucket].title}</span>
            </span>
            {bucket === value ? <Check size={15} strokeWidth={2} className="shrink-0" /> : null}
          </button>
        ))}
      </AnchoredPanel>
    </>
  );
}

/** The one word beside a figure, wherever a figure is not simply what it says. */
export function EntryTag({ tag }: { tag: "avg" | "est" | "ended" | null }) {
  if (tag === null) return null;
  if (tag === "ended") {
    return (
      <span className="ml-1.5 shrink-0 rounded-md bg-subtle px-1.5 py-0.5 text-micro font-medium text-text-tertiary">
        Ended
      </span>
    );
  }
  return <span className="ml-1 text-micro font-normal text-text-tertiary">{tag}</span>;
}

/**
 * A form's title and its buttons, on one row, **above** the fields.
 *
 * This is the shape every form on this screen wears, and the reason is the
 * iOS keyboard. Focusing a field raises it, and Safari scrolls that field into
 * view over whatever is left of the page — with the number pad, the autofill bar
 * and Safari's own URL bar, about 380pt of an 844pt screen. Anything *below* the
 * field is therefore under the keyboard, which is how Save came to be sliced in
 * half the moment a bill was typed.
 *
 * Putting the buttons above the fields fixes it structurally rather than by
 * measuring the keyboard: whatever Safari scrolls to reveal the field, the row
 * above it is necessarily still on screen. It also reads the way a native sheet
 * reads — Cancel and Done at the top, the form underneath.
 */
export function FormHeader({
  title,
  saveLabel = "Save",
  saveDisabled,
  onSave,
  onCancel,
  onDelete,
  deleteLabel = "Delete"
}: {
  title: string;
  saveLabel?: string;
  saveDisabled?: boolean;
  onSave: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <span className="min-w-0 flex-1 truncate text-label font-semibold text-text-primary">{title}</span>
      {onDelete ? (
        <ActionButton tone="danger" onClick={onDelete}>
          {deleteLabel}
        </ActionButton>
      ) : null}
      {onCancel ? (
        <ActionButton tone="quiet" onClick={onCancel}>
          Cancel
        </ActionButton>
      ) : null}
      <ActionButton tone="primary" disabled={saveDisabled} onClick={onSave}>
        {saveLabel}
      </ActionButton>
    </div>
  );
}

/** The tinted strip that says a new block has started inside a card. */
export function BlockHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-[38px] items-center gap-2.5 bg-[#F4F2EC] px-3.5 py-2 sm:px-4">
      <h3 className="min-w-0 flex-1 truncate text-label font-semibold tracking-[-0.01em] text-text-primary">
        {title}
      </h3>
      {action}
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { AnchoredPanel } from "@/components/ui/AnchoredPanel";
import { CADENCE_SUFFIX, CADENCE_TAG } from "@/lib/finances";
import { PAY_CADENCES } from "@/types/finance";
import type { PayCadence } from "@/types/finance";

/**
 * How often this figure arrives — the label above the amount, made tappable.
 *
 * It sits in the space the field's own caption already occupied ("A MONTH"), so
 * a setting most lines never touch costs no height at all: the caption states
 * the cadence and opening it changes it. It shows the whole list with a tick
 * rather than cycling, because a control that changes what a number means has
 * to show what it could mean instead.
 */
export function CadencePicker({
  value,
  onChange,
  className,
  variant = "caption"
}: {
  value: PayCadence;
  onChange: (next: PayCadence) => void;
  className?: string;
  /** `caption` sits above a field as its label; `control` stands on its own in a row. */
  variant?: "caption" | "control";
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        className={cn(
          "focus-ring flex items-center transition-colors duration-200 ease-out",
          variant === "caption"
            ? "-ml-1 mb-1 gap-0.5 rounded-md px-1 py-0.5 text-[12px] font-medium uppercase tracking-[0.04em] text-text-tertiary hover:bg-subtle hover:text-text-secondary"
            : "h-11 gap-1 rounded-xl border border-border bg-subtle px-2.5 text-[13px] text-text-secondary hover:border-border-emphasis hover:text-text-primary",
          className
        )}
        type="button"
        aria-label={`Paid ${CADENCE_SUFFIX[value]} — change how often`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{variant === "caption" ? CADENCE_TAG[value] : value}</span>
        <ChevronDown size={variant === "caption" ? 12 : 14} strokeWidth={2} className="shrink-0" />
      </button>

      <AnchoredPanel anchorRef={triggerRef} open={open} onClose={() => setOpen(false)} width={208} className="p-1.5">
        {PAY_CADENCES.map((cadence) => (
          <button
            key={cadence}
            className={cn(
              "focus-ring flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-[14px] transition-colors duration-200 ease-out",
              cadence === value ? "bg-accent-soft text-text-primary" : "text-text-secondary hover:bg-subtle"
            )}
            type="button"
            onClick={() => {
              onChange(cadence);
              setOpen(false);
            }}
          >
            <span>
              {cadence}
              <span className="block text-[11.5px] text-text-tertiary">{CADENCE_SUFFIX[cadence]}</span>
            </span>
            {cadence === value ? <Check size={15} strokeWidth={2} className="shrink-0" /> : null}
          </button>
        ))}
      </AnchoredPanel>
    </>
  );
}

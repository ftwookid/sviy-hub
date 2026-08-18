"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The one X in the app.
 *
 * Every overlay had been drawing its own — h-8 here, min-h-10 and px-3 there,
 * icons at 17, 18 and 20 — so the same control sat at a different size and in a
 * slightly different spot depending on which panel you had opened. One
 * component, one 44px tap target, top-right of the panel header, always.
 *
 * The negative offsets pull the button's padding back so the icon lines up with
 * the panel's own edge rather than sitting inset from it.
 */
export function CloseButton({
  onClick,
  label = "Close",
  className
}: {
  onClick: () => void;
  /** Override only when "Close" would be wrong, e.g. "Cancel" on a form. */
  label?: string;
  className?: string;
}) {
  return (
    <button
      className={cn(
        "focus-ring -mr-1.5 -mt-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-text-secondary transition hover:bg-subtle hover:text-text-primary",
        className
      )}
      type="button"
      aria-label={label}
      onClick={onClick}
    >
      <X size={19} strokeWidth={1.7} />
    </button>
  );
}

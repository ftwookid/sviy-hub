"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { AnchoredPanel } from "@/components/ui/AnchoredPanel";
import type { ClientStatus } from "@/types/client";

export type ClientFilter = ClientStatus | "All";

export const CLIENT_FILTERS: ClientFilter[] = ["Active", "Paused", "All"];

/**
 * Which clients are being shown — a chip, not a row.
 *
 * This was the second of two stacked segmented rows, which is the one thing the
 * space rules say never to do, and it cost 56px on every visit to a control that
 * sits on `Active` almost always. Paused and All are looked at occasionally;
 * that is a filter, not navigation, and a filter does not get a row of its own.
 *
 * It lives in the page header instead, which on a phone was **empty** — `Add
 * client` is a floating button below `sm`, so the whole right of the title row
 * was going to waste.
 *
 * It opens the list rather than cycling: the house rule is that a control which
 * changes what you are looking at shows you the options, so the count beside
 * each one answers "is there anything in Paused?" without switching to find out.
 */
export function ClientFilterMenu({
  value,
  counts,
  onChange
}: {
  value: ClientFilter;
  counts: Record<ClientFilter, number>;
  onChange: (next: ClientFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        className="focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-subtle px-3.5 text-[14px] font-medium text-text-primary transition-colors duration-200 ease-out hover:bg-border"
        type="button"
        aria-label={`Showing ${value} clients — change`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value}</span>
        <span className="tabular-nums text-text-tertiary">{counts[value]}</span>
        <ChevronDown size={15} strokeWidth={2} className="shrink-0 text-text-tertiary" />
      </button>

      <AnchoredPanel anchorRef={triggerRef} open={open} onClose={() => setOpen(false)} width={196} className="p-1.5">
        {CLIENT_FILTERS.map((filter) => (
          <button
            key={filter}
            className={cn(
              "focus-ring flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-[14px] transition-colors duration-200 ease-out",
              filter === value ? "bg-accent-soft text-text-primary" : "text-text-secondary hover:bg-subtle"
            )}
            type="button"
            onClick={() => {
              onChange(filter);
              setOpen(false);
            }}
          >
            <span>
              {filter}
              <span className="ml-1.5 tabular-nums text-text-tertiary">{counts[filter]}</span>
            </span>
            {filter === value ? <Check size={15} strokeWidth={2} className="shrink-0" /> : null}
          </button>
        ))}
      </AnchoredPanel>
    </>
  );
}

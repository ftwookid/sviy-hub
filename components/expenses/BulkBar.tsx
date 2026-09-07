"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The bar that appears once rows are selected.
 *
 * Two rows on a phone and one on a laptop: the action words are the whole
 * point, so they never collapse to bare icons on small screens. Sits above the
 * mobile tab bar rather than under it.
 */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(84px+env(safe-area-inset-bottom))] md:pb-5">
      <div className="pointer-events-auto w-full max-w-[620px] rounded-2xl bg-text-primary/95 p-1.5 shadow-[0_18px_48px_rgba(48,38,24,0.32)] backdrop-blur-xl sm:flex sm:items-center sm:gap-2 sm:pl-3">
        <div className="flex items-center justify-between px-1.5 py-1 sm:p-0">
          <span className="shrink-0 text-list font-medium text-white">{count} selected</span>
          <button
            className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white sm:hidden"
            type="button"
            aria-label="Clear selection"
            onClick={onClear}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="mt-1 flex gap-1 sm:ml-auto sm:mt-0 sm:items-center">{children}</div>

        <button
          className="focus-ring hidden h-9 w-9 shrink-0 place-items-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white sm:grid"
          type="button"
          aria-label="Clear selection"
          onClick={onClear}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export function BulkAction({
  icon: Icon,
  label,
  tone = "neutral",
  onClick
}: {
  icon: LucideIcon;
  label: string;
  /** Destructive actions read red against the dark bar so they are never a slip. */
  tone?: "neutral" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "focus-ring inline-flex h-9 min-w-0 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-1.5 text-meta font-medium transition sm:flex-none sm:px-2.5 sm:text-list",
        tone === "danger"
          ? "bg-[#C05050] text-white hover:bg-[#B14444]"
          : "bg-white/12 text-white hover:bg-white/22"
      )}
      type="button"
      onClick={onClick}
    >
      <Icon size={15} strokeWidth={2.1} />
      {label}
    </button>
  );
}

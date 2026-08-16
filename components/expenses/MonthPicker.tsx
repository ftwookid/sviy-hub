"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { currentPeriodMonth, periodMonthLabel, shiftPeriodMonth } from "@/lib/expenses";
import { parseLocalDate, toInputDate } from "@/lib/formatters";

const MONTH_LABELS = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(2000, index, 1))
);

/**
 * Month navigation for the expenses period.
 *
 * The arrows alone meant a month a year back was a dozen taps away, so the
 * label opens a year-and-month grid: any month within a year is one tap, and
 * any other year is one tap per year from there.
 */
export function MonthPicker({
  periodMonth,
  onChange
}: {
  periodMonth: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Browsing a year in the panel does not change the selected month until a
  // month is actually tapped, so glancing at last year costs nothing.
  const [browsingYear, setBrowsingYear] = useState(() => parseLocalDate(periodMonth).getFullYear());
  const containerRef = useRef<HTMLDivElement>(null);

  const thisMonth = currentPeriodMonth();
  const selectedYear = parseLocalDate(periodMonth).getFullYear();
  const selectedMonthIndex = parseLocalDate(periodMonth).getMonth();
  const currentYear = parseLocalDate(thisMonth).getFullYear();
  const currentMonthIndex = parseLocalDate(thisMonth).getMonth();
  const isCurrentMonth = periodMonth === thisMonth;

  // Reopening should start from the month in view, not wherever it was left.
  useEffect(() => {
    if (open) setBrowsingYear(selectedYear);
  }, [open, selectedYear]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function selectMonth(monthIndex: number) {
    onChange(toInputDate(new Date(browsingYear, monthIndex, 1)));
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center justify-between gap-2 rounded-[20px] border border-border bg-surface p-2 shadow-card">
        <Button
          className="h-11 w-11 shrink-0 px-0"
          variant="soft"
          aria-label="Previous month"
          onClick={() => onChange(shiftPeriodMonth(periodMonth, -1))}
        >
          <ChevronLeft size={18} strokeWidth={1.7} />
        </Button>

        <button
          className="focus-ring min-w-0 flex-1 rounded-xl px-2 py-1 transition hover:bg-subtle"
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((current) => !current)}
        >
          <div className="flex items-center justify-center gap-1.5">
            <span className="truncate text-[16px] font-medium text-text-primary">
              {periodMonthLabel(periodMonth)}
            </span>
            <ChevronDown
              size={16}
              strokeWidth={1.8}
              className={cn("shrink-0 text-text-tertiary transition", open && "rotate-180")}
            />
          </div>
          <div className="text-[12px] text-text-tertiary">
            {isCurrentMonth ? "Current month" : "Tap to pick a month"}
          </div>
        </button>

        <Button
          className="h-11 w-11 shrink-0 px-0"
          variant="soft"
          aria-label="Next month"
          onClick={() => onChange(shiftPeriodMonth(periodMonth, 1))}
        >
          <ChevronRight size={18} strokeWidth={1.7} />
        </Button>
      </div>

      {open ? (
        <div
          className="absolute left-0 right-0 top-full z-40 mt-2 rounded-[20px] border border-border bg-surface p-3 shadow-card"
          role="dialog"
          aria-label="Choose a month"
        >
          <div className="flex items-center justify-between gap-2">
            <Button
              className="h-11 w-11 shrink-0 px-0"
              variant="soft"
              aria-label="Previous year"
              onClick={() => setBrowsingYear((year) => year - 1)}
            >
              <ChevronLeft size={18} strokeWidth={1.7} />
            </Button>
            <div className="text-[17px] font-medium text-text-primary">{browsingYear}</div>
            <Button
              className="h-11 w-11 shrink-0 px-0"
              variant="soft"
              aria-label="Next year"
              onClick={() => setBrowsingYear((year) => year + 1)}
            >
              <ChevronRight size={18} strokeWidth={1.7} />
            </Button>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2">
            {MONTH_LABELS.map((label, index) => {
              const isSelected = browsingYear === selectedYear && index === selectedMonthIndex;
              const isThisMonth = browsingYear === currentYear && index === currentMonthIndex;

              return (
                <button
                  key={label}
                  className={cn(
                    "focus-ring h-11 rounded-xl text-[15px] font-medium transition",
                    isSelected
                      ? "bg-accent text-text-primary"
                      : "bg-subtle text-text-secondary hover:bg-border",
                    // The current month stays findable even while another is selected.
                    !isSelected && isThisMonth && "ring-1 ring-inset ring-accent"
                  )}
                  type="button"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => selectMonth(index)}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {!isCurrentMonth ? (
            <Button
              className="mt-2 w-full"
              variant="soft"
              onClick={() => {
                onChange(thisMonth);
                setOpen(false);
              }}
            >
              Jump to {periodMonthLabel(thisMonth)}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

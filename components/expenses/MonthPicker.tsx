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
  onChange,
  variant = "control"
}: {
  periodMonth: string;
  onChange: (next: string) => void;
  /**
   * `control` sits in a row of controls next to buttons, and takes the width it
   * is given. `panel` stands as a card in its own right, above or beside other
   * cards — so it wears their radius and shadow, and keeps its arrows next to
   * the label instead of pushing them out to the edges of whatever it is in.
   */
  variant?: "control" | "panel";
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
    <div className={cn("relative", variant === "panel" && "h-full")} ref={containerRef}>
      {/* One 44px row. The old two-line card spent a third of its height telling
          the user they could tap it, which the chevron already says. */}
      <div
        className={cn(
          "flex items-center gap-0.5 border border-border bg-surface p-0.5",
          // A panel fills the height it is given, so it can sit in a grid row
          // beside a card and end level with it instead of 10px short.
          variant === "panel"
            ? "h-full min-h-[60px] justify-center rounded-[20px] shadow-card"
            : "h-11 rounded-xl shadow-sm"
        )}
      >
        <button
          className="focus-ring grid h-10 w-9 shrink-0 place-items-center rounded-[10px] text-text-secondary transition hover:bg-subtle hover:text-text-primary"
          type="button"
          aria-label="Previous month"
          onClick={() => onChange(shiftPeriodMonth(periodMonth, -1))}
        >
          <ChevronLeft size={17} strokeWidth={1.9} />
        </button>

        <button
          className={cn(
            "focus-ring flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-[10px] px-2 transition hover:bg-subtle",
            // A fixed box, so the arrows do not creep inwards on "May 2026" and
            // outwards on "September 2026". The label re-centres inside it; the
            // controls either side of it never move.
            //
            // 224px, not the 196px it was: the widest case is "September 2026"
            // *with* the Now chip beside it, which measures 196.4px — four
            // tenths of a pixel over, so the month the page opens on was the one
            // month that read "September 20…". A box sized to the exact worst
            // case has no room for a phone whose text metrics differ by a hair,
            // which is every phone; this one has ~27px of slack. It shrinks
            // rather than overflowing under ~360px, where the card itself cannot
            // hold 224px plus both arrows.
            variant === "panel" ? "w-[224px]" : "flex-1"
          )}
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((current) => !current)}
        >
          <span className="truncate text-[15px] font-medium text-text-primary">
            {periodMonthLabel(periodMonth)}
          </span>
          {isCurrentMonth ? (
            <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
              Now
            </span>
          ) : null}
          <ChevronDown
            size={15}
            strokeWidth={1.9}
            className={cn("shrink-0 text-text-tertiary transition", open && "rotate-180")}
          />
        </button>

        <button
          className="focus-ring grid h-10 w-9 shrink-0 place-items-center rounded-[10px] text-text-secondary transition hover:bg-subtle hover:text-text-primary"
          type="button"
          aria-label="Next month"
          onClick={() => onChange(shiftPeriodMonth(periodMonth, 1))}
        >
          <ChevronRight size={17} strokeWidth={1.9} />
        </button>
      </div>

      {open ? (
        <div
          className="absolute left-0 top-full z-40 mt-2 w-full min-w-[268px] rounded-[20px] border border-border bg-surface p-3 shadow-card"
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

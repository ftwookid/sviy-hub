"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { parseLocalDate, todayInputValue, toInputDate } from "@/lib/formatters";
import { FieldShell } from "@/components/ui/Field";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthTitle(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

function displayDate(dateValue: string) {
  if (!dateValue) return "Choose date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parseLocalDate(dateValue));
}

function calendarDays(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const leadingDays = firstDay.getDay();
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const populatedDays = leadingDays + daysInMonth;
  const trailingDays = Math.max(0, 42 - populatedDays);

  return [
    ...Array.from({ length: leadingDays }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1)),
    ...Array.from({ length: trailingDays }, () => null)
  ];
}

function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function isToday(date: Date) {
  return toInputDate(date) === todayInputValue();
}

function isFutureDate(date: Date) {
  return toInputDate(date) > todayInputValue();
}

function nearbyYears(date: Date) {
  const start = date.getFullYear() - 5;
  return Array.from({ length: 12 }, (_, index) => start + index);
}

/** Enough for seven 36px columns plus the panel's own padding. */
const PANEL_WIDTH = 296;
const PANEL_HEIGHT = 340;
const VIEWPORT_MARGIN = 8;

type PanelPosition = { left: number; top: number; width: number };

/**
 * The panel is portalled to the body and positioned in viewport coordinates.
 *
 * It used to be `absolute` inside the field, which works right up until the
 * field sits in something that clips — and most of the places this field is
 * used do: the Finances setup card is `overflow-hidden` for its 20px corners,
 * and every slide-over is `overflow-y-auto`. Either one cuts the calendar in
 * half. Nothing an ancestor does can clip a fixed element in a body portal.
 */
function panelPosition(trigger: DOMRect): PanelPosition {
  const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, trigger.left),
    window.innerWidth - width - VIEWPORT_MARGIN
  );

  const below = trigger.bottom + 8;
  const roomBelow = window.innerHeight - below;
  // Flip above only when there is genuinely more room up there, so a field near
  // the bottom of a sheet opens upwards instead of running off the screen.
  const top =
    roomBelow < PANEL_HEIGHT && trigger.top - 8 > roomBelow
      ? Math.max(VIEWPORT_MARGIN, trigger.top - 8 - PANEL_HEIGHT)
      : Math.min(below, Math.max(VIEWPORT_MARGIN, window.innerHeight - PANEL_HEIGHT - VIEWPORT_MARGIN));

  return { left, top, width };
}

export function DateField({
  label,
  value,
  error,
  dimFutureDates = true,
  onChange
}: {
  label: string;
  value: string;
  error?: string;
  dimFutureDates?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"days" | "monthYear">("days");
  const [calendarMonth, setCalendarMonth] = useState(() => parseLocalDate(value || todayInputValue()));
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setPosition(panelPosition(trigger.getBoundingClientRect()));
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
      setMode("days");
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, mode, reposition]);

  // The field can be inside a scrolling sheet, so the panel has to follow it.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (value) setCalendarMonth(parseLocalDate(value));
  }, [value]);

  function changeMonth(event: React.MouseEvent<HTMLButtonElement>, offset: number) {
    event.preventDefault();
    event.stopPropagation();
    setCalendarMonth((current) => addMonths(current, offset));
  }

  function selectDate(event: React.MouseEvent<HTMLButtonElement>, date: Date) {
    event.preventDefault();
    event.stopPropagation();
    onChange(toInputDate(date));
    setOpen(false);
    setMode("days");
  }

  function selectYear(event: React.MouseEvent<HTMLButtonElement>, year: number) {
    event.preventDefault();
    event.stopPropagation();
    setCalendarMonth((current) => new Date(year, current.getMonth(), 1));
  }

  function selectMonth(event: React.MouseEvent<HTMLButtonElement>, month: number) {
    event.preventDefault();
    event.stopPropagation();
    setCalendarMonth((current) => new Date(current.getFullYear(), month, 1));
    setMode("days");
  }

  return (
    <FieldShell label={label} error={error}>
      <div ref={rootRef} className="relative">
        <button
          ref={triggerRef}
          className={cn(
            "focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border bg-subtle px-4 text-left text-[16px] text-text-primary transition duration-200 ease-in-out hover:border-border-emphasis",
            error ? "border-danger" : "border-border"
          )}
          type="button"
          onClick={() => setOpen((current) => !current)}
        >
          <span>{displayDate(value)}</span>
          <CalendarDays size={17} strokeWidth={1.6} className="shrink-0 text-text-tertiary" />
        </button>

        {open && position && typeof document !== "undefined" ? (
          createPortal(
          <div
            ref={panelRef}
            className="fixed z-[200] rounded-2xl border border-border bg-surface p-3 shadow-[0_18px_48px_rgba(80,66,44,0.14)]"
            style={{ left: position.left, top: position.top, width: position.width }}
          >
            <div className="flex min-h-10 items-center justify-between gap-3">
              <button
                className="focus-ring inline-grid h-9 w-9 place-items-center rounded-xl text-text-tertiary transition hover:bg-subtle hover:text-text-primary"
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => changeMonth(event, -1)}
                aria-label="Previous month"
              >
                <ChevronLeft size={17} strokeWidth={1.7} />
              </button>
              <button
                className="focus-ring min-h-9 rounded-xl px-3 text-[15px] font-medium text-text-primary transition hover:bg-subtle"
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setMode((current) => (current === "days" ? "monthYear" : "days"));
                }}
              >
                {monthTitle(calendarMonth)}
              </button>
              <button
                className="focus-ring inline-grid h-9 w-9 place-items-center rounded-xl text-text-tertiary transition hover:bg-subtle hover:text-text-primary"
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => changeMonth(event, 1)}
                aria-label="Next month"
              >
                <ChevronRight size={17} strokeWidth={1.7} />
              </button>
            </div>

            {mode === "days" ? (
              <>
                <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-text-tertiary">
                  {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                    <span key={`${day}-${index}`}>{day}</span>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {calendarDays(calendarMonth).map((date, index) =>
                    date ? (
                      <button
                        key={toInputDate(date)}
                        className={cn(
                          "focus-ring relative grid h-9 place-items-center rounded-xl text-[13px] font-medium transition",
                          value === toInputDate(date)
                            ? "bg-accent text-text-primary shadow-sm"
                            : "text-text-secondary hover:bg-subtle hover:text-text-primary",
                          dimFutureDates &&
                            isFutureDate(date) &&
                            value !== toInputDate(date) &&
                            "text-text-tertiary opacity-40 hover:opacity-70"
                        )}
                        type="button"
                        onClick={(event) => selectDate(event, date)}
                      >
                        {date.getDate()}
                        {isToday(date) ? (
                          <span
                            className={cn(
                              "absolute bottom-1 h-1 w-1 rounded-full",
                              value === toInputDate(date) ? "bg-text-primary" : "bg-accent"
                            )}
                          />
                        ) : null}
                      </button>
                    ) : (
                      <span key={`empty-${index}`} className="h-9" />
                    )
                  )}
                </div>
              </>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-4 gap-1.5">
                  {nearbyYears(calendarMonth).map((year) => (
                    <button
                      key={year}
                      className={cn(
                        "focus-ring min-h-9 rounded-xl text-[13px] font-medium transition",
                        calendarMonth.getFullYear() === year
                          ? "bg-accent text-text-primary shadow-sm"
                          : "text-text-secondary hover:bg-subtle hover:text-text-primary"
                      )}
                      type="button"
                      onClick={(event) => selectYear(event, year)}
                    >
                      {year}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {MONTH_NAMES.map((month, index) => (
                    <button
                      key={month}
                      className={cn(
                        "focus-ring min-h-9 rounded-xl text-[13px] font-medium transition",
                        calendarMonth.getMonth() === index
                          ? "bg-accent text-text-primary shadow-sm"
                          : "text-text-secondary hover:bg-subtle hover:text-text-primary"
                      )}
                      type="button"
                      onClick={(event) => selectMonth(event, index)}
                    >
                      {month}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>,
          document.body
          )
        ) : null}
      </div>
    </FieldShell>
  );
}

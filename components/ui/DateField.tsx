"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { AnchoredPanel } from "@/components/ui/AnchoredPanel";
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

/** Seven 36px columns plus the panel's own padding. */
const PANEL_WIDTH = 296;

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
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    setMode("days");
  }

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
    close();
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
      <div className="relative">
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

        <AnchoredPanel anchorRef={triggerRef} open={open} onClose={close} width={PANEL_WIDTH} className="p-3">
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
        </AnchoredPanel>
      </div>
    </FieldShell>
  );
}

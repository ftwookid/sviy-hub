import type { ClientPaymentMethod } from "@/types/client";
import type { HouseSittingBooking } from "@/types/houseSitting";
import { ROVER_COMMISSION_RATE } from "@/lib/clients";
import { parseLocalDate, toInputDate } from "@/lib/formatters";

const DAY_MS = 86_400_000;

export function addDays(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

export function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

export function addYears(date: Date, offset: number) {
  return new Date(date.getFullYear() + offset, 0, 1);
}

export function startOfWeek(date: Date) {
  return addDays(date, -date.getDay());
}

export function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}

export function calendarMonthDays(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const leadingDays = firstDay.getDay();
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const populatedDays = leadingDays + daysInMonth;
  const trailingDays = Math.max(0, 42 - populatedDays);

  return [
    ...Array.from({ length: leadingDays }, (_, index) => addDays(firstDay, index - leadingDays)),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1)),
    ...Array.from({ length: trailingDays }, (_, index) => new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, index + 1))
  ];
}

export function dateRangeLabel(startDate: string, endDate: string) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric"
  }).format(start);
  const endLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(end);

  return `${startLabel} - ${endLabel}`;
}

export function nightsBetween(startDate: string, endDate: string) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  return Math.max(1, diff);
}

export function bookingOverlapsDate(booking: Pick<HouseSittingBooking, "start_date" | "end_date">, date: Date) {
  const value = toInputDate(date);
  return booking.start_date <= value && booking.end_date >= value;
}

export function bookingOverlapsRange(
  booking: Pick<HouseSittingBooking, "start_date" | "end_date">,
  startDate: string,
  endDate: string
) {
  return booking.start_date <= endDate && booking.end_date >= startDate;
}

export function estimateHouseSitting(input: {
  startDate: string;
  endDate: string;
  nightlyRate: number;
  paymentMethod: ClientPaymentMethod;
  commissionRate?: number;
}) {
  const nights = nightsBetween(input.startDate, input.endDate);
  const gross = nights * input.nightlyRate;
  const commissionRate = input.commissionRate ?? ROVER_COMMISSION_RATE;
  const roverFee = input.paymentMethod === "Rover" ? gross * commissionRate : 0;

  return {
    nights,
    gross,
    roverFee,
    net: gross - roverFee,
    taxable: input.paymentMethod !== "Cash"
  };
}

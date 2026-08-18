"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BedDouble,
  CalendarDays,
  CalendarX,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { ClientPaymentIcon } from "@/components/ClientPaymentBadge";
import { Button } from "@/components/ui/Button";
import { CloseButton } from "@/components/ui/CloseButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateField } from "@/components/ui/DateField";
import { FieldShell, Input, Select } from "@/components/ui/Field";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { CLIENT_PAYMENT_METHODS, PET_TYPES, ROVER_COMMISSION_RATE } from "@/lib/clients";
import {
  addDays,
  addMonths,
  addYears,
  bookingOverlapsDate,
  bookingOverlapsRange,
  calendarMonthDays,
  dateRangeLabel,
  endOfWeek,
  estimateHouseSitting,
  isCancelled,
  nightsBetween,
  startOfWeek
} from "@/lib/houseSitting";
import { formatCurrency, parseLocalDate, todayInputValue, toInputDate } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
import { loadUsers } from "@/lib/userLabels";
import type { ClientPaymentMethod, ClientWithPets, PetType } from "@/types/client";
import type {
  HouseSittingBooking,
  HouseSittingCalendarView,
  HouseSittingCustomer,
  HouseSittingFormValues,
  HouseSittingPet
} from "@/types/houseSitting";

type HouseSittingDashboardProps = {
  userId: string;
  regularClients: ClientWithPets[];
};

type CustomerOption = {
  key: string;
  source: "regular" | "house";
  id: string;
  userId: string;
  label: string;
  address: string;
  petNames: string;
  pets: HouseSittingPet[];
};

type OwnerOption = {
  id: string;
  label: string;
};

type PendingAction = {
  type: "cancel" | "restore" | "delete";
  booking: HouseSittingBooking;
};

type FormErrors = Partial<Record<keyof HouseSittingFormValues | "owner", string>>;

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function defaultValues(initialDate?: string): HouseSittingFormValues {
  const startDate = initialDate ?? todayInputValue();
  return {
    customer_name: "",
    address: "",
    pets: [],
    payment_method: "Rover",
    start_date: startDate,
    end_date: startDate,
    nightly_rate: ""
  };
}

function valuesFromBooking(booking?: HouseSittingBooking, initialDate?: string): HouseSittingFormValues {
  if (!booking) return defaultValues(initialDate);
  return {
    customer_name: booking.customer_name,
    address: booking.address,
    pets: normalizePets(booking.pets, booking.pet_names),
    payment_method: booking.payment_method,
    start_date: booking.start_date,
    end_date: booking.end_date,
    nightly_rate: String(Number(booking.nightly_rate))
  };
}

function titleForView(view: HouseSittingCalendarView, cursorDate: Date) {
  if (view === "week") {
    return `${shortDate(toInputDate(startOfWeek(cursorDate)))} - ${shortDate(toInputDate(endOfWeek(cursorDate)))}`;
  }

  if (view === "year") return String(cursorDate.getFullYear());
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(cursorDate);
}

function shortDate(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parseLocalDate(dateValue));
}

function fullDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(date);
}

function monthTitle(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
}

function shortMonthTitle(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

function isSameMonth(date: Date, cursorDate: Date) {
  return date.getFullYear() === cursorDate.getFullYear() && date.getMonth() === cursorDate.getMonth();
}

function bookingSort(a: HouseSittingBooking, b: HouseSittingBooking) {
  return a.start_date.localeCompare(b.start_date) || a.customer_name.localeCompare(b.customer_name);
}

function activeFirstSort(a: HouseSittingBooking, b: HouseSittingBooking) {
  const cancelledDelta = Number(isCancelled(a)) - Number(isCancelled(b));
  return cancelledDelta || bookingSort(a, b);
}

function paymentTone(method: ClientPaymentMethod) {
  if (method === "Rover") return "bg-success-soft text-success";
  if (method === "Venmo") return "bg-blue-100 text-blue-700";
  return "bg-[#F1F0ED] text-text-secondary";
}

function paymentDot(method: ClientPaymentMethod) {
  if (method === "Rover") return "bg-success";
  if (method === "Venmo") return "bg-blue-500";
  return "bg-text-tertiary";
}

function customerPets(client: ClientWithPets) {
  return client.pets.map((pet) => pet.name).filter(Boolean).join(", ");
}

function customerPetRecords(client: ClientWithPets): HouseSittingPet[] {
  return client.pets.map((pet) => ({ name: pet.name, type: pet.type }));
}

function petsLabel(pets: HouseSittingPet[]) {
  return pets
    .map((pet) => {
      const name = pet.name.trim();
      return name ? `${name} (${pet.type})` : "";
    })
    .filter(Boolean)
    .join(", ");
}

function normalizePets(pets: unknown, petNames: string): HouseSittingPet[] {
  if (Array.isArray(pets)) {
    const normalized = pets
      .map((pet) => {
        if (!pet || typeof pet !== "object") return null;
        const record = pet as Partial<HouseSittingPet>;
        const name = typeof record.name === "string" ? record.name.trim() : "";
        const type = PET_TYPES.includes(record.type as PetType) ? (record.type as PetType) : "Dog";
        return name ? { name, type } : null;
      })
      .filter(Boolean) as HouseSittingPet[];

    if (normalized.length > 0) return normalized;
  }

  return petNames
    .split(",")
    .map((rawName) => {
      const name = rawName.trim();
      if (!name) return null;

      const typeMatch = name.match(/\s+\((Dog|Cat|Bird|Exotic)\)$/);
      if (!typeMatch) return { name, type: "Dog" as PetType };

      return {
        name: name.slice(0, -typeMatch[0].length).trim(),
        type: typeMatch[1] as PetType
      };
    })
    .filter(Boolean) as HouseSittingPet[];
}

function optionFromBooking(
  booking: HouseSittingBooking | undefined,
  regularClients: ClientWithPets[],
  houseCustomers: HouseSittingCustomer[]
): CustomerOption | null {
  if (!booking) return null;

  if (booking.regular_client_id) {
    const client = regularClients.find((regularClient) => regularClient.id === booking.regular_client_id);
    if (client) {
      return {
        key: `regular-${client.id}`,
        source: "regular",
        id: client.id,
        userId: client.user_id,
        label: client.name,
        address: client.address,
        petNames: customerPets(client),
        pets: customerPetRecords(client)
      };
    }
  }

  if (booking.customer_id) {
    const customer = houseCustomers.find((houseCustomer) => houseCustomer.id === booking.customer_id);
    if (customer) {
      return {
        key: `house-${customer.id}`,
        source: "house",
        id: customer.id,
        userId: customer.user_id,
        label: customer.name,
        address: customer.address,
        petNames: customer.pet_names,
        pets: normalizePets(customer.pets, customer.pet_names)
      };
    }
  }

  return null;
}

function isMissingColumn(error: unknown, column: string) {
  const postgrestError = error as { code?: string; message?: string } | null;
  const message = postgrestError?.message ?? "";
  return (postgrestError?.code === "42703" || postgrestError?.code === "PGRST204") && message.includes(column);
}

function isMissingPetsColumn(error: unknown) {
  return isMissingColumn(error, "pets");
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  const postgrestError = error as { message?: string } | null;
  return postgrestError?.message ?? fallback;
}

export function HouseSittingDashboard({ userId, regularClients }: HouseSittingDashboardProps) {
  const [bookings, setBookings] = useState<HouseSittingBooking[]>([]);
  const [houseCustomers, setHouseCustomers] = useState<HouseSittingCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<HouseSittingBooking | null>(null);
  const [formInitialDate, setFormInitialDate] = useState<string | undefined>(undefined);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [calendarView, setCalendarView] = useState<HouseSittingCalendarView>("month");
  const [cursorDate, setCursorDate] = useState(() => parseLocalDate(todayInputValue()));
  const [daySheetDate, setDaySheetDate] = useState<Date | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [toast, setToast] = useState("");

  const loadHouseSitting = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    const bookingQuery = supabase.from("house_sittings").select("*").order("start_date", { ascending: true });
    const customerQuery = supabase.from("house_sitting_customers").select("*").order("name", { ascending: true });

    const [{ data: bookingData, error: bookingError }, { data: customerData, error: customerError }] = await Promise.all([
      bookingQuery,
      customerQuery
    ]);
    if (bookingError || customerError) {
      setLoadError("House sitting database tables are not ready yet. Run supabase/house-sitting-schema.sql in Supabase.");
      setBookings([]);
      setHouseCustomers([]);
      setLoading(false);
      return;
    }

    setLoadError("");
    setBookings(
      ((bookingData ?? []) as HouseSittingBooking[]).map((booking) => ({
        ...booking,
        status: booking.status === "Cancelled" ? "Cancelled" : "Planned"
      }))
    );
    setHouseCustomers((customerData ?? []) as HouseSittingCustomer[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadHouseSitting();
  }, [loadHouseSitting]);

  useEffect(() => {
    let active = true;
    loadUsers().then((users) => {
      if (active) setOwnerOptions(users);
    });
    return () => {
      active = false;
    };
  }, []);

  const ownerLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    ownerOptions.forEach((owner) => {
      labels[owner.id] = owner.label;
    });
    return labels;
  }, [ownerOptions]);

  const stats = useMemo(() => {
    const today = todayInputValue();
    const yearStart = `${cursorDate.getFullYear()}-01-01`;
    const yearEnd = `${cursorDate.getFullYear()}-12-31`;
    const monthStart = toInputDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1));
    const monthEnd = toInputDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 0));
    const planned = bookings.filter((booking) => !isCancelled(booking));
    const upcoming = planned.filter((booking) => booking.end_date >= today).sort(bookingSort);
    const monthBookings = planned.filter((booking) => bookingOverlapsRange(booking, monthStart, monthEnd));
    const yearBookings = planned.filter((booking) => bookingOverlapsRange(booking, yearStart, yearEnd));
    const monthNights = monthBookings.reduce((total, booking) => total + nightsBetween(booking.start_date, booking.end_date), 0);
    const yearNet = yearBookings.reduce(
      (total, booking) =>
        total +
        estimateHouseSitting({
          startDate: booking.start_date,
          endDate: booking.end_date,
          nightlyRate: Number(booking.nightly_rate),
          paymentMethod: booking.payment_method,
          commissionRate: Number(booking.rover_commission_rate)
        }).net,
      0
    );

    return {
      nextBooking: upcoming[0] ?? null,
      upcomingCount: upcoming.length,
      monthNights,
      yearNet
    };
  }, [bookings, cursorDate]);

  const daySheetBookings = useMemo(() => {
    if (!daySheetDate) return [];
    return bookings.filter((booking) => bookingOverlapsDate(booking, daySheetDate)).sort(activeFirstSort);
  }, [bookings, daySheetDate]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  }

  function moveCursor(offset: number) {
    setCursorDate((current) => {
      if (calendarView === "week") return addDays(current, offset * 7);
      if (calendarView === "year") return addYears(current, offset);
      return addMonths(current, offset);
    });
  }

  function openNewStay(initialDate?: string) {
    setEditingBooking(null);
    setFormInitialDate(initialDate);
    setFormOpen(true);
  }

  function openBooking(booking: HouseSittingBooking) {
    setEditingBooking(booking);
    setFormInitialDate(undefined);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingBooking(null);
    setFormInitialDate(undefined);
  }

  function openDay(date: Date) {
    setDaySheetDate(date);
  }

  function requestAction(action: PendingAction) {
    setActionError("");
    setPendingAction(action);
  }

  async function runPendingAction() {
    if (!supabase || !pendingAction) return;
    setActionBusy(true);
    setActionError("");

    const { type, booking } = pendingAction;

    try {
      if (type === "delete") {
        const { error } = await supabase.from("house_sittings").delete().eq("id", booking.id);
        if (error) throw error;
      } else {
        const nextStatus = type === "cancel" ? "Cancelled" : "Planned";
        const { error } = await supabase
          .from("house_sittings")
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq("id", booking.id);
        if (error) {
          if (isMissingColumn(error, "status")) {
            throw new Error(
              "Cancelling needs a database update. Run supabase/house-sitting-schema.sql in Supabase, then try again."
            );
          }
          throw error;
        }
      }

      setPendingAction(null);
      if (editingBooking?.id === booking.id) closeForm();
      await loadHouseSitting();
      showToast(type === "delete" ? "Stay deleted" : type === "cancel" ? "Stay cancelled" : "Stay restored");
    } catch (error) {
      setActionError(errorMessage(error, "Could not update this house sitting stay."));
    } finally {
      setActionBusy(false);
    }
  }

  const confirmCopy = pendingAction
    ? pendingAction.type === "delete"
      ? {
          title: "Delete this stay?",
          description: `${pendingAction.booking.customer_name} · ${dateRangeLabel(
            pendingAction.booking.start_date,
            pendingAction.booking.end_date
          )} will be permanently removed. This cannot be undone.`,
          confirmLabel: "Delete stay",
          cancelLabel: "Keep it",
          tone: "danger" as const
        }
      : pendingAction.type === "cancel"
        ? {
            title: "Cancel this stay?",
            description: `${pendingAction.booking.customer_name} · ${dateRangeLabel(
              pendingAction.booking.start_date,
              pendingAction.booking.end_date
            )} stays on the calendar as cancelled and stops counting toward booked nights and earnings. You can restore it later.`,
            confirmLabel: "Cancel stay",
            cancelLabel: "Keep it booked",
            tone: "danger" as const
          }
        : {
            title: "Restore this stay?",
            description: `${pendingAction.booking.customer_name} · ${dateRangeLabel(
              pendingAction.booking.start_date,
              pendingAction.booking.end_date
            )} goes back to planned and counts toward booked nights and earnings again.`,
            confirmLabel: "Restore stay",
            cancelLabel: "Leave cancelled",
            tone: "accent" as const
          }
    : null;

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <HouseMetric
          icon={CalendarDays}
          label="Upcoming"
          value={String(stats.upcomingCount)}
          detail={stats.nextBooking ? `${stats.nextBooking.customer_name} next` : "No future stays"}
        />
        <HouseMetric icon={Moon} label="Booked nights" value={String(stats.monthNights)} detail="For selected month" />
        <HouseMetric icon={Sparkles} label="Year net" value={formatCurrency(stats.yearNet)} detail={`${cursorDate.getFullYear()} house sitting`} />
        <HouseMetric
          icon={BedDouble}
          label="Next stay"
          value={stats.nextBooking ? shortDate(stats.nextBooking.start_date) : "None"}
          detail={stats.nextBooking ? dateRangeLabel(stats.nextBooking.start_date, stats.nextBooking.end_date) : "Calendar is clear"}
        />
      </section>

      <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card sm:rounded-[24px]">
        <div className="flex flex-col gap-3 border-b border-border p-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
          <div className="min-w-0">
            <h2 className="text-[19px] font-medium leading-tight text-text-primary sm:text-[22px]">House sitting calendar</h2>
            <p className="mt-1 text-[13px] text-text-secondary sm:text-[14px]">
              Past and future overnight stays, separate from regular walks.
            </p>
          </div>
          <Button className="w-full shrink-0 sm:w-auto" variant="accent" onClick={() => openNewStay()}>
            <Plus size={18} strokeWidth={1.6} />
            Add stay
          </Button>
        </div>

        <div className="flex flex-col gap-2.5 border-b border-border bg-[#FFFEFB] p-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-4">
          <div className="grid min-h-11 w-full grid-cols-3 rounded-2xl border border-border bg-subtle p-1 sm:w-fit">
            {(["week", "month", "year"] as HouseSittingCalendarView[]).map((view) => (
              <button
                key={view}
                className={cn(
                  "focus-ring rounded-xl px-3 text-[13px] font-medium capitalize transition duration-150 ease-out",
                  calendarView === view ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
                )}
                type="button"
                onClick={() => setCalendarView(view)}
              >
                {view}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-end">
            <Button className="h-11 w-11 shrink-0 px-0" variant="soft" onClick={() => moveCursor(-1)} aria-label="Previous period">
              <ChevronLeft size={18} strokeWidth={1.7} />
            </Button>
            <button
              className="focus-ring min-h-11 min-w-0 flex-1 truncate rounded-xl px-2 text-center text-[15px] font-medium text-text-primary transition hover:bg-subtle sm:flex-none sm:px-3 sm:text-[16px] lg:min-w-48"
              type="button"
              onClick={() => setCursorDate(parseLocalDate(todayInputValue()))}
            >
              {titleForView(calendarView, cursorDate)}
            </button>
            <Button className="h-11 w-11 shrink-0 px-0" variant="soft" onClick={() => moveCursor(1)} aria-label="Next period">
              <ChevronRight size={18} strokeWidth={1.7} />
            </Button>
          </div>
        </div>

        <div className="p-2.5 sm:p-4">
          {loading ? <SkeletonRows /> : null}
          {!loading && loadError ? (
            <section className="rounded-[20px] border border-warning/30 bg-warning-soft px-4 py-5 sm:px-5 sm:py-6">
              <h3 className="text-[17px] font-medium text-text-primary sm:text-[18px]">House sitting needs database setup</h3>
              <p className="mt-2 text-[14px] text-text-secondary">{loadError}</p>
            </section>
          ) : null}
          {!loading && !loadError && bookings.length === 0 ? (
            <section className="rounded-[20px] border border-border bg-page px-4 py-10 text-center sm:px-5 sm:py-12">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-accent-soft">
                <Home size={28} strokeWidth={1.5} className="text-accent" />
              </div>
              <h3 className="mt-5 text-[19px] font-medium text-text-primary sm:text-[20px]">No house sitting stays yet</h3>
              <p className="mx-auto mt-2 max-w-sm text-[14px] text-text-secondary">
                Add a booked date range and it will appear on the calendar for weekly, monthly, and yearly planning.
              </p>
              <Button className="mt-5 w-full sm:w-auto" variant="accent" onClick={() => openNewStay()}>
                <Plus size={18} strokeWidth={1.6} />
                Add stay
              </Button>
            </section>
          ) : null}
          {!loading && !loadError && bookings.length > 0 ? (
            <>
              {calendarView === "week" ? (
                <WeekCalendar
                  cursorDate={cursorDate}
                  bookings={bookings}
                  ownerLabels={ownerLabels}
                  onOpenBooking={openBooking}
                  onOpenDay={openDay}
                />
              ) : null}
              {calendarView === "month" ? (
                <MonthCalendar
                  cursorDate={cursorDate}
                  bookings={bookings}
                  ownerLabels={ownerLabels}
                  onOpenBooking={openBooking}
                  onOpenDay={openDay}
                />
              ) : null}
              {calendarView === "year" ? (
                <YearCalendar
                  cursorDate={cursorDate}
                  bookings={bookings}
                  ownerLabels={ownerLabels}
                  onOpenBooking={openBooking}
                  onSelectMonth={(month) => {
                    setCursorDate(new Date(cursorDate.getFullYear(), month, 1));
                    setCalendarView("month");
                  }}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      {!loading && !loadError && bookings.length > 0 ? (
        <BookingList bookings={bookings} ownerLabels={ownerLabels} onOpenBooking={openBooking} />
      ) : null}

      {daySheetDate ? (
        <DaySheet
          date={daySheetDate}
          bookings={daySheetBookings}
          ownerLabels={ownerLabels}
          onClose={() => setDaySheetDate(null)}
          onOpenBooking={(booking) => {
            setDaySheetDate(null);
            openBooking(booking);
          }}
          onAddStay={() => {
            const dateValue = toInputDate(daySheetDate);
            setDaySheetDate(null);
            openNewStay(dateValue);
          }}
          onRequestAction={requestAction}
        />
      ) : null}

      {formOpen ? (
        <HouseSittingForm
          booking={editingBooking ?? undefined}
          initialDate={formInitialDate}
          bookings={bookings}
          userId={userId}
          canChangeOwner
          ownerOptions={ownerOptions}
          regularClients={regularClients}
          houseCustomers={houseCustomers}
          onClose={closeForm}
          onRequestAction={requestAction}
          onSaved={() => {
            closeForm();
            loadHouseSitting();
          }}
        />
      ) : null}

      {pendingAction && confirmCopy ? (
        <ConfirmDialog
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          cancelLabel={confirmCopy.cancelLabel}
          tone={confirmCopy.tone}
          busy={actionBusy}
          error={actionError}
          onConfirm={runPendingAction}
          onCancel={() => {
            if (actionBusy) return;
            setPendingAction(null);
            setActionError("");
          }}
        />
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </div>
  );
}

function HouseMetric({
  icon: Icon,
  label,
  value,
  detail
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-h-[108px] rounded-[18px] border border-border bg-surface p-3 shadow-card sm:min-h-[128px] sm:p-4">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-text-tertiary sm:text-[11px]">{label}</div>
          <div className="mt-2 truncate text-[21px] font-medium leading-none text-text-primary sm:text-[26px]">{value}</div>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[13px] bg-accent-soft text-accent sm:h-10 sm:w-10 sm:rounded-[16px]">
          <Icon size={16} strokeWidth={1.6} className="sm:hidden" />
          <Icon size={18} strokeWidth={1.6} className="hidden sm:block" />
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-[12px] leading-snug text-text-secondary sm:mt-4 sm:text-[14px]">{detail}</p>
    </div>
  );
}

function WeekdayHeader() {
  return (
    <div className="grid grid-cols-7 gap-1 pb-1.5 text-center text-[10px] font-medium uppercase tracking-[0.05em] text-text-tertiary sm:pb-2 sm:text-[11px] lg:gap-2">
      {WEEK_DAYS.map((day) => (
        <span key={day}>
          <span className="sm:hidden">{day.slice(0, 1)}</span>
          <span className="hidden sm:inline">{day}</span>
        </span>
      ))}
    </div>
  );
}

function WeekCalendar({
  cursorDate,
  bookings,
  ownerLabels,
  onOpenBooking,
  onOpenDay
}: {
  cursorDate: Date;
  bookings: HouseSittingBooking[];
  ownerLabels: Record<string, string>;
  onOpenBooking: (booking: HouseSittingBooking) => void;
  onOpenDay: (date: Date) => void;
}) {
  const weekStart = startOfWeek(cursorDate);
  const weekEnd = endOfWeek(cursorDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const weekBookings = bookings
    .filter((booking) => bookingOverlapsRange(booking, toInputDate(weekStart), toInputDate(weekEnd)))
    .sort(activeFirstSort);

  return (
    <div className="space-y-4">
      <div>
        <WeekdayHeader />
        <div className="grid grid-cols-7 gap-1 lg:gap-2">
          {days.map((date) => {
            const dateBookings = bookings.filter((booking) => bookingOverlapsDate(booking, date)).sort(activeFirstSort);
            return (
              <CalendarDayCell
                key={toInputDate(date)}
                date={date}
                bookings={dateBookings}
                ownerLabels={ownerLabels}
                compact={false}
                onOpenBooking={onOpenBooking}
                onOpenDay={onOpenDay}
              />
            );
          })}
        </div>
      </div>

      <div className="lg:hidden">
        <h3 className="text-[13px] font-medium uppercase tracking-[0.04em] text-text-tertiary">Stays this week</h3>
        <div className="mt-2 space-y-2">
          {weekBookings.length > 0 ? (
            weekBookings.map((booking) => (
              <BookingRow key={booking.id} booking={booking} ownerLabel={ownerLabels[booking.user_id]} onOpenBooking={onOpenBooking} />
            ))
          ) : (
            <EmptyLine text="No stays booked this week." />
          )}
        </div>
      </div>
    </div>
  );
}

function MonthCalendar({
  cursorDate,
  bookings,
  ownerLabels,
  onOpenBooking,
  onOpenDay
}: {
  cursorDate: Date;
  bookings: HouseSittingBooking[];
  ownerLabels: Record<string, string>;
  onOpenBooking: (booking: HouseSittingBooking) => void;
  onOpenDay: (date: Date) => void;
}) {
  return (
    <div>
      <WeekdayHeader />
      <div className="grid grid-cols-7 gap-1 lg:gap-2">
        {calendarMonthDays(cursorDate).map((date) => {
          const dateBookings = bookings.filter((booking) => bookingOverlapsDate(booking, date)).sort(activeFirstSort);
          return (
            <CalendarDayCell
              key={toInputDate(date)}
              date={date}
              bookings={dateBookings}
              ownerLabels={ownerLabels}
              muted={!isSameMonth(date, cursorDate)}
              compact
              onOpenBooking={onOpenBooking}
              onOpenDay={onOpenDay}
            />
          );
        })}
      </div>
      <p className="mt-3 text-center text-[12px] text-text-tertiary lg:hidden">Tap a day to see or add stays.</p>
    </div>
  );
}

function CalendarDayCell({
  date,
  bookings,
  ownerLabels,
  muted = false,
  compact,
  onOpenBooking,
  onOpenDay
}: {
  date: Date;
  bookings: HouseSittingBooking[];
  ownerLabels: Record<string, string>;
  muted?: boolean;
  compact: boolean;
  onOpenBooking: (booking: HouseSittingBooking) => void;
  onOpenDay: (date: Date) => void;
}) {
  const today = toInputDate(date) === todayInputValue();
  const plannedCount = bookings.filter((booking) => !isCancelled(booking)).length;
  const visibleDots = bookings.slice(0, 3);

  return (
    <div
      className={cn(
        "relative min-h-[58px] rounded-xl border border-border bg-[#FFFEFB] p-1 sm:min-h-[76px] sm:p-1.5 lg:min-h-[118px] lg:rounded-[18px] lg:p-2.5",
        muted && "bg-page/60 text-text-tertiary",
        plannedCount > 0 && "border-accent/50 bg-accent-soft/35"
      )}
    >
      <button
        className="focus-ring absolute inset-0 z-10 rounded-xl lg:hidden"
        type="button"
        onClick={() => onOpenDay(date)}
        aria-label={`${fullDate(date)}, ${bookings.length} ${bookings.length === 1 ? "stay" : "stays"}`}
      />

      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "grid h-6 w-6 place-items-center rounded-full text-[12px] font-medium sm:h-7 sm:w-7 sm:text-[13px]",
            today ? "bg-accent text-text-primary" : "text-text-secondary",
            muted && !today && "text-text-tertiary"
          )}
        >
          {date.getDate()}
        </span>
        {plannedCount > 0 ? (
          <span className="hidden text-[11px] font-medium text-accent lg:inline">{plannedCount}</span>
        ) : null}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1 px-0.5 lg:hidden">
        {visibleDots.map((booking) => (
          <span
            key={booking.id}
            className={cn(
              "h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2",
              isCancelled(booking) ? "bg-border-emphasis ring-1 ring-inset ring-text-tertiary/40" : paymentDot(booking.payment_method)
            )}
          />
        ))}
        {bookings.length > 3 ? <span className="text-[9px] font-medium text-text-tertiary sm:text-[10px]">+{bookings.length - 3}</span> : null}
      </div>

      <div className="mt-2 hidden space-y-1 lg:block">
        {bookings.slice(0, compact ? 2 : 4).map((booking) => (
          <BookingPill key={booking.id} booking={booking} ownerLabel={ownerLabels[booking.user_id]} onOpenBooking={onOpenBooking} />
        ))}
        {bookings.length > (compact ? 2 : 4) ? (
          <div className="px-2 text-[11px] font-medium text-text-tertiary">+{bookings.length - (compact ? 2 : 4)} more</div>
        ) : null}
      </div>
    </div>
  );
}

function YearCalendar({
  cursorDate,
  bookings,
  ownerLabels,
  onOpenBooking,
  onSelectMonth
}: {
  cursorDate: Date;
  bookings: HouseSittingBooking[];
  ownerLabels: Record<string, string>;
  onOpenBooking: (booking: HouseSittingBooking) => void;
  onSelectMonth: (month: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
      {Array.from({ length: 12 }, (_, month) => {
        const monthDate = new Date(cursorDate.getFullYear(), month, 1);
        const start = toInputDate(monthDate);
        const end = toInputDate(new Date(cursorDate.getFullYear(), month + 1, 0));
        const monthBookings = bookings.filter((booking) => bookingOverlapsRange(booking, start, end)).sort(activeFirstSort);
        const plannedBookings = monthBookings.filter((booking) => !isCancelled(booking));
        const nights = plannedBookings.reduce((total, booking) => total + nightsBetween(booking.start_date, booking.end_date), 0);
        const net = plannedBookings.reduce(
          (total, booking) =>
            total +
            estimateHouseSitting({
              startDate: booking.start_date,
              endDate: booking.end_date,
              nightlyRate: Number(booking.nightly_rate),
              paymentMethod: booking.payment_method,
              commissionRate: Number(booking.rover_commission_rate)
            }).net,
          0
        );

        return (
          <div
            key={month}
            className="relative min-h-[100px] rounded-[18px] border border-border bg-[#FFFEFB] p-3 sm:min-h-[124px] lg:min-h-[156px] lg:p-4"
          >
            <button
              className="focus-ring absolute inset-0 z-10 rounded-[18px] lg:hidden"
              type="button"
              onClick={() => onSelectMonth(month)}
              aria-label={`Open ${monthTitle(monthDate)}`}
            />

            <div className="flex items-start justify-between gap-2 lg:gap-3">
              <div className="min-w-0">
                <h3 className="text-[15px] font-medium text-text-primary sm:text-[16px]">
                  <span className="sm:hidden">{shortMonthTitle(monthDate)}</span>
                  <span className="hidden sm:inline">{monthTitle(monthDate)}</span>
                </h3>
                <p className="mt-1 text-[12px] text-text-secondary sm:text-[13px]">
                  {nights} {nights === 1 ? "night" : "nights"}
                </p>
              </div>
              <span className="shrink-0 text-[12px] font-medium tabular-nums text-text-secondary sm:text-[13px]">
                {formatCurrency(net)}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1 lg:hidden">
              {monthBookings.slice(0, 4).map((booking) => (
                <span
                  key={booking.id}
                  className={cn(
                    "h-2 w-2 rounded-full",
                    isCancelled(booking) ? "bg-border-emphasis ring-1 ring-inset ring-text-tertiary/40" : paymentDot(booking.payment_method)
                  )}
                />
              ))}
              {monthBookings.length > 4 ? (
                <span className="text-[10px] font-medium text-text-tertiary">+{monthBookings.length - 4}</span>
              ) : null}
              {monthBookings.length === 0 ? <span className="text-[12px] text-text-tertiary">Open month</span> : null}
            </div>

            <div className="mt-3 hidden space-y-1 lg:block">
              {monthBookings.slice(0, 3).map((booking) => (
                <BookingPill key={booking.id} booking={booking} ownerLabel={ownerLabels[booking.user_id]} onOpenBooking={onOpenBooking} />
              ))}
              {monthBookings.length === 0 ? <p className="text-[13px] text-text-tertiary">Open month</p> : null}
              {monthBookings.length > 3 ? (
                <p className="px-2 text-[11px] font-medium text-text-tertiary">+{monthBookings.length - 3} more stays</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CancelledChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-[#F1F0ED] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-text-tertiary",
        className
      )}
    >
      Cancelled
    </span>
  );
}

function BookingPill({
  booking,
  ownerLabel,
  onOpenBooking
}: {
  booking: HouseSittingBooking;
  ownerLabel?: string;
  onOpenBooking: (booking: HouseSittingBooking) => void;
}) {
  const label = ownerLabel ?? "";
  const cancelled = isCancelled(booking);

  return (
    <button
      className={cn(
        "focus-ring block w-full min-w-0 rounded-xl px-2 py-1 text-left text-[12px] font-medium transition hover:brightness-[0.98]",
        cancelled ? "bg-[#F1F0ED] text-text-tertiary" : paymentTone(booking.payment_method)
      )}
      type="button"
      onClick={() => onOpenBooking(booking)}
      title={`${booking.customer_name}${cancelled ? " (cancelled)" : ""}${label ? ` · ${label}` : ""}`}
    >
      <div className={cn("truncate", cancelled && "line-through")}>{booking.customer_name}</div>
      <div className="truncate text-[11px] opacity-75">
        {cancelled ? "Cancelled" : label || dateRangeLabel(booking.start_date, booking.end_date)}
      </div>
    </button>
  );
}

function BookingList({
  bookings,
  ownerLabels,
  onOpenBooking
}: {
  bookings: HouseSittingBooking[];
  ownerLabels: Record<string, string>;
  onOpenBooking: (booking: HouseSittingBooking) => void;
}) {
  const today = todayInputValue();
  const upcoming = bookings.filter((booking) => booking.end_date >= today).sort(activeFirstSort).slice(0, 6);
  const recent = bookings
    .filter((booking) => booking.end_date < today)
    .sort((a, b) => b.end_date.localeCompare(a.end_date))
    .slice(0, 4);

  return (
    <section className="grid gap-3 sm:gap-4 lg:grid-cols-[1.35fr_0.9fr]">
      <div className="rounded-[20px] border border-border bg-surface p-3.5 shadow-card sm:rounded-[24px] sm:p-4">
        <h2 className="text-[17px] font-medium text-text-primary sm:text-[18px]">Upcoming stays</h2>
        <div className="mt-3 space-y-2">
          {upcoming.length > 0 ? (
            upcoming.map((booking) => (
              <BookingRow key={booking.id} booking={booking} ownerLabel={ownerLabels[booking.user_id]} onOpenBooking={onOpenBooking} />
            ))
          ) : (
            <EmptyLine text="No upcoming stays booked." />
          )}
        </div>
      </div>
      <div className="rounded-[20px] border border-border bg-surface p-3.5 shadow-card sm:rounded-[24px] sm:p-4">
        <h2 className="text-[17px] font-medium text-text-primary sm:text-[18px]">Recently finished</h2>
        <div className="mt-3 space-y-2">
          {recent.length > 0 ? (
            recent.map((booking) => (
              <BookingRow key={booking.id} booking={booking} compact ownerLabel={ownerLabels[booking.user_id]} onOpenBooking={onOpenBooking} />
            ))
          ) : (
            <EmptyLine text="No finished stays yet." />
          )}
        </div>
      </div>
    </section>
  );
}

function BookingRow({
  booking,
  ownerLabel,
  compact = false,
  onOpenBooking
}: {
  booking: HouseSittingBooking;
  ownerLabel?: string;
  compact?: boolean;
  onOpenBooking: (booking: HouseSittingBooking) => void;
}) {
  const cancelled = isCancelled(booking);
  const estimate = estimateHouseSitting({
    startDate: booking.start_date,
    endDate: booking.end_date,
    nightlyRate: Number(booking.nightly_rate),
    paymentMethod: booking.payment_method,
    commissionRate: Number(booking.rover_commission_rate)
  });

  return (
    <button
      className={cn(
        "focus-ring flex w-full items-center justify-between gap-2.5 rounded-2xl bg-subtle px-3 py-3 text-left transition hover:bg-border sm:gap-3",
        cancelled && "opacity-70"
      )}
      type="button"
      onClick={() => onOpenBooking(booking)}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-[15px] font-medium text-text-primary", cancelled && "line-through")}>
            {booking.customer_name}
          </span>
          {cancelled ? <CancelledChip /> : null}
        </div>
        <div className="mt-0.5 truncate text-[13px] text-text-secondary">{dateRangeLabel(booking.start_date, booking.end_date)}</div>
        {ownerLabel ? <div className="mt-0.5 truncate text-[12px] font-medium text-text-tertiary">{ownerLabel}</div> : null}
        {!compact ? <div className="mt-0.5 truncate text-[12px] text-text-tertiary">{booking.pet_names || "Pets not listed"}</div> : null}
      </div>
      <div className="shrink-0 text-right">
        <div className={cn("text-[15px] font-medium tabular-nums text-text-primary", cancelled && "line-through")}>
          {formatCurrency(estimate.net)}
        </div>
        <div className="mt-0.5 text-[12px] text-text-tertiary">
          {estimate.nights} {estimate.nights === 1 ? "night" : "nights"}
        </div>
      </div>
    </button>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-2xl bg-subtle px-3 py-4 text-[14px] text-text-secondary">{text}</p>;
}

function DaySheet({
  date,
  bookings,
  ownerLabels,
  onClose,
  onOpenBooking,
  onAddStay,
  onRequestAction
}: {
  date: Date;
  bookings: HouseSittingBooking[];
  ownerLabels: Record<string, string>;
  onClose: () => void;
  onOpenBooking: (booking: HouseSittingBooking) => void;
  onAddStay: () => void;
  onRequestAction: (action: PendingAction) => void;
}) {
  useEscapeKey(onClose);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#1A1916]/25 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="sheet-panel flex max-h-[85vh] w-full flex-col rounded-t-[28px] border border-border bg-page shadow-[0_-8px_40px_rgba(48,38,24,0.18)] sm:max-w-[520px] sm:rounded-[24px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="text-[19px] font-medium leading-tight text-text-primary">{fullDate(date)}</h2>
            <p className="mt-0.5 text-[13px] text-text-secondary">
              {bookings.length === 0 ? "No stays booked" : `${bookings.length} ${bookings.length === 1 ? "stay" : "stays"}`}
            </p>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {bookings.length === 0 ? (
            <EmptyLine text="Nothing booked on this day yet." />
          ) : (
            bookings.map((booking) => (
              <DaySheetRow
                key={booking.id}
                booking={booking}
                ownerLabel={ownerLabels[booking.user_id]}
                onOpenBooking={onOpenBooking}
                onRequestAction={onRequestAction}
              />
            ))
          )}
        </div>

        <div className="border-t border-border p-4 pb-[calc(16px+env(safe-area-inset-bottom))] sm:pb-4">
          <Button className="w-full" variant="accent" onClick={onAddStay}>
            <Plus size={18} strokeWidth={1.6} />
            Add stay on {shortDate(toInputDate(date))}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DaySheetRow({
  booking,
  ownerLabel,
  onOpenBooking,
  onRequestAction
}: {
  booking: HouseSittingBooking;
  ownerLabel?: string;
  onOpenBooking: (booking: HouseSittingBooking) => void;
  onRequestAction: (action: PendingAction) => void;
}) {
  const cancelled = isCancelled(booking);
  const estimate = estimateHouseSitting({
    startDate: booking.start_date,
    endDate: booking.end_date,
    nightlyRate: Number(booking.nightly_rate),
    paymentMethod: booking.payment_method,
    commissionRate: Number(booking.rover_commission_rate)
  });

  return (
    <div className={cn("rounded-[20px] border border-border bg-surface p-3 shadow-card", cancelled && "opacity-75")}>
      <button
        className="focus-ring flex w-full items-start justify-between gap-3 rounded-xl text-left"
        type="button"
        onClick={() => onOpenBooking(booking)}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn("truncate text-[15px] font-medium text-text-primary", cancelled && "line-through")}>
              {booking.customer_name}
            </span>
            {cancelled ? <CancelledChip /> : null}
          </div>
          <div className="mt-0.5 truncate text-[13px] text-text-secondary">{dateRangeLabel(booking.start_date, booking.end_date)}</div>
          <div className="mt-0.5 truncate text-[12px] text-text-tertiary">{booking.pet_names || "Pets not listed"}</div>
          {ownerLabel ? <div className="mt-0.5 truncate text-[12px] font-medium text-text-tertiary">{ownerLabel}</div> : null}
        </div>
        <div className="shrink-0 text-right">
          <div className={cn("text-[15px] font-medium tabular-nums text-text-primary", cancelled && "line-through")}>
            {formatCurrency(estimate.net)}
          </div>
          <div className="mt-0.5 text-[12px] text-text-tertiary">
            {estimate.nights} {estimate.nights === 1 ? "night" : "nights"}
          </div>
        </div>
      </button>

      <div className="mt-3 flex gap-2 border-t border-border pt-3">
        <Button
          className="flex-1 text-[14px]"
          variant="soft"
          type="button"
          onClick={() => onRequestAction({ type: cancelled ? "restore" : "cancel", booking })}
        >
          {cancelled ? <RotateCcw size={16} strokeWidth={1.7} /> : <CalendarX size={16} strokeWidth={1.7} />}
          {cancelled ? "Restore" : "Cancel stay"}
        </Button>
        <Button
          className="w-11 shrink-0 px-0"
          variant="danger"
          type="button"
          aria-label={`Delete stay for ${booking.customer_name}`}
          onClick={() => onRequestAction({ type: "delete", booking })}
        >
          <Trash2 size={16} strokeWidth={1.7} />
        </Button>
      </div>
    </div>
  );
}

function HouseSittingForm({
  booking,
  initialDate,
  bookings,
  userId,
  canChangeOwner,
  ownerOptions,
  regularClients,
  houseCustomers,
  onClose,
  onSaved,
  onRequestAction
}: {
  booking?: HouseSittingBooking;
  initialDate?: string;
  bookings: HouseSittingBooking[];
  userId: string;
  canChangeOwner: boolean;
  ownerOptions: OwnerOption[];
  regularClients: ClientWithPets[];
  houseCustomers: HouseSittingCustomer[];
  onClose: () => void;
  onSaved: () => void;
  onRequestAction: (action: PendingAction) => void;
}) {
  const isEditing = Boolean(booking);
  const cancelled = Boolean(booking && isCancelled(booking));
  const [values, setValues] = useState<HouseSittingFormValues>(() => valuesFromBooking(booking, initialDate));
  const [ownerId, setOwnerId] = useState(booking?.user_id ?? userId);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(() =>
    optionFromBooking(booking, regularClients, houseCustomers)
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const ownerMenuRef = useRef<HTMLDivElement>(null);

  const customerOptions = useMemo<CustomerOption[]>(() => {
    const regularOptions = regularClients.map((client) => ({
      key: `regular-${client.id}`,
      source: "regular" as const,
      id: client.id,
      userId: client.user_id,
      label: client.name,
      address: client.address,
      petNames: customerPets(client),
      pets: customerPetRecords(client)
    }));
    const houseOptions = houseCustomers.map((customer) => ({
      key: `house-${customer.id}`,
      source: "house" as const,
      id: customer.id,
      userId: customer.user_id,
      label: customer.name,
      address: customer.address,
      petNames: customer.pet_names,
      pets: normalizePets(customer.pets, customer.pet_names)
    }));

    return [...regularOptions, ...houseOptions].sort((a, b) => a.label.localeCompare(b.label));
  }, [houseCustomers, regularClients]);

  const ownerSelectOptions = useMemo(() => {
    if (!ownerId || ownerOptions.some((owner) => owner.id === ownerId)) return ownerOptions;
    return [{ id: ownerId, label: `User ${ownerId.slice(0, 8)}` }, ...ownerOptions];
  }, [ownerId, ownerOptions]);

  const filteredCustomerOptions = useMemo(() => {
    const query = values.customer_name.trim().toLowerCase();
    if (!query) return customerOptions.slice(0, 8);
    return customerOptions
      .filter((option) =>
        [option.label, option.address, option.petNames, option.source].some((value) => value.toLowerCase().includes(query))
      )
      .slice(0, 8);
  }, [customerOptions, values.customer_name]);

  const latestBookingByOption = useMemo(() => {
    const byOption = new Map<string, HouseSittingBooking>();
    bookings
      .filter((nextBooking) => nextBooking.id !== booking?.id)
      .slice()
      .sort((a, b) => b.start_date.localeCompare(a.start_date) || b.created_at.localeCompare(a.created_at))
      .forEach((nextBooking) => {
        if (nextBooking.customer_id && !byOption.has(`house-${nextBooking.customer_id}`)) {
          byOption.set(`house-${nextBooking.customer_id}`, nextBooking);
        }
        if (nextBooking.regular_client_id && !byOption.has(`regular-${nextBooking.regular_client_id}`)) {
          byOption.set(`regular-${nextBooking.regular_client_id}`, nextBooking);
        }
      });

    return byOption;
  }, [booking?.id, bookings]);

  const estimate = estimateHouseSitting({
    startDate: values.start_date,
    endDate: values.end_date,
    nightlyRate: Number(values.nightly_rate || 0),
    paymentMethod: values.payment_method
  });

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setCustomerMenuOpen(false);
      if (!ownerMenuRef.current?.contains(event.target as Node)) setOwnerMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function update<K extends keyof HouseSittingFormValues>(key: K, value: HouseSittingFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function updateCustomerName(value: string) {
    setSelectedCustomer(null);
    update("customer_name", value);
    setCustomerMenuOpen(true);
  }

  function chooseCustomer(option: CustomerOption) {
    const latestBooking = latestBookingByOption.get(option.key);
    setSelectedCustomer(option);
    setValues((current) => ({
      ...current,
      customer_name: option.label,
      address: option.address || current.address,
      pets: option.pets.length > 0 ? option.pets : current.pets,
      payment_method: !isEditing && latestBooking ? latestBooking.payment_method : current.payment_method,
      nightly_rate: !isEditing && latestBooking ? String(Number(latestBooking.nightly_rate)) : current.nightly_rate
    }));
    if (canChangeOwner) setOwnerId(option.userId);
    setErrors((current) => ({ ...current, customer_name: undefined, address: undefined, pets: undefined }));
    setCustomerMenuOpen(false);
  }

  function ownerLabel(nextOwnerId: string) {
    return ownerSelectOptions.find((owner) => owner.id === nextOwnerId)?.label ?? `User ${nextOwnerId.slice(0, 8)}`;
  }

  function updateOwner(nextOwnerId: string) {
    setOwnerId(nextOwnerId);
    setOwnerMenuOpen(false);
  }

  function confirmCustomerName(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();

    const customerName = values.customer_name.trim();
    const exactMatch = filteredCustomerOptions.find((option) => option.label.toLowerCase() === customerName.toLowerCase());

    if (exactMatch) {
      chooseCustomer(exactMatch);
      return;
    }

    setValues((current) => ({ ...current, customer_name: customerName }));
    setErrors((current) => ({ ...current, customer_name: undefined }));
    setCustomerMenuOpen(false);
    event.currentTarget.blur();
  }

  function updatePet(index: number, patch: Partial<HouseSittingPet>) {
    setValues((current) => ({
      ...current,
      pets: current.pets.map((pet, petIndex) => (petIndex === index ? { ...pet, ...patch } : pet))
    }));
    setErrors((current) => ({ ...current, pets: undefined }));
  }

  function addPet() {
    setValues((current) => ({
      ...current,
      pets: [...current.pets, { name: "", type: "Dog" }]
    }));
    setErrors((current) => ({ ...current, pets: undefined }));
  }

  function removePet(index: number) {
    setValues((current) => ({
      ...current,
      pets: current.pets.filter((_, petIndex) => petIndex !== index)
    }));
  }

  function validate() {
    const nextErrors: FormErrors = {};
    if (!values.customer_name.trim()) nextErrors.customer_name = "Customer name is required.";
    if (canChangeOwner && !ownerId) nextErrors.owner = "Choose an owner.";
    if (!values.address.trim()) nextErrors.address = "Address is required.";
    if (values.pets.length === 0) {
      nextErrors.pets = "Add at least one pet.";
    } else if (values.pets.some((pet) => !pet.name.trim() || !pet.type)) {
      nextErrors.pets = "Each pet needs a name and type.";
    }
    if (!values.start_date) nextErrors.start_date = "Choose a start date.";
    if (!values.end_date) nextErrors.end_date = "Choose a finish date.";
    if (values.start_date && values.end_date && values.end_date < values.start_date) {
      nextErrors.end_date = "Finish date must be after the start date.";
    }
    if (!values.nightly_rate || Number(values.nightly_rate) <= 0) {
      nextErrors.nightly_rate = "Enter a nightly price greater than $0.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function saveBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !validate()) return;
    setSaving(true);
    setFormError("");

    try {
      const bookingOwnerId = canChangeOwner ? ownerId : booking?.user_id ?? userId;
      const originalCustomerKept = Boolean(booking && values.customer_name.trim() === booking.customer_name.trim());
      let houseCustomerId = selectedCustomer ? (selectedCustomer.source === "house" ? selectedCustomer.id : null) : booking?.customer_id ?? null;
      const regularClientId =
        selectedCustomer
          ? selectedCustomer.source === "regular"
            ? selectedCustomer.id
            : null
          : !houseCustomerId && originalCustomerKept
            ? booking?.regular_client_id ?? null
            : null;
      const normalizedPets = values.pets.map((pet) => ({ name: pet.name.trim(), type: pet.type }));
      const nextPetNames = petsLabel(normalizedPets);

      if (houseCustomerId) {
        const customerPayload = {
          user_id: bookingOwnerId,
          name: values.customer_name.trim(),
          address: values.address.trim(),
          pet_names: nextPetNames,
          pets: normalizedPets,
          updated_at: new Date().toISOString()
        };
        const { error } = await supabase
          .from("house_sitting_customers")
          .update(customerPayload)
          .eq("id", houseCustomerId);
        if (error) {
          if (!isMissingPetsColumn(error)) throw error;
          const { pets: _pets, ...legacyCustomerPayload } = customerPayload;
          const { error: legacyError } = await supabase
            .from("house_sitting_customers")
            .update(legacyCustomerPayload)
            .eq("id", houseCustomerId);
          if (legacyError) throw legacyError;
        }
      }

      if (!houseCustomerId && !regularClientId) {
        const customerPayload = {
          user_id: bookingOwnerId,
          name: values.customer_name.trim(),
          address: values.address.trim(),
          pet_names: nextPetNames,
          pets: normalizedPets
        };
        const { data, error } = await supabase
          .from("house_sitting_customers")
          .insert(customerPayload)
          .select("id")
          .single();
        if (error) {
          if (!isMissingPetsColumn(error)) throw error;
          const { pets: _pets, ...legacyCustomerPayload } = customerPayload;
          const { data: legacyData, error: legacyError } = await supabase
            .from("house_sitting_customers")
            .insert(legacyCustomerPayload)
            .select("id")
            .single();
          if (legacyError) throw legacyError;
          houseCustomerId = legacyData.id as string;
        } else {
          houseCustomerId = data.id as string;
        }
      }

      const bookingPayload = {
        user_id: bookingOwnerId,
        customer_id: houseCustomerId,
        regular_client_id: regularClientId,
        customer_name: values.customer_name.trim(),
        address: values.address.trim(),
        pet_names: nextPetNames,
        pets: normalizedPets,
        payment_method: values.payment_method,
        start_date: values.start_date,
        end_date: values.end_date,
        nightly_rate: Number(Number(values.nightly_rate || 0).toFixed(2)),
        rover_commission_rate: ROVER_COMMISSION_RATE,
        updated_at: new Date().toISOString()
      };

      const { error } = booking
        ? await supabase.from("house_sittings").update(bookingPayload).eq("id", booking.id)
        : await supabase.from("house_sittings").insert(bookingPayload);
      if (error) {
        if (!isMissingPetsColumn(error)) throw error;
        const { pets: _pets, ...legacyBookingPayload } = bookingPayload;
        const { error: legacyError } = booking
          ? await supabase.from("house_sittings").update(legacyBookingPayload).eq("id", booking.id)
          : await supabase.from("house_sittings").insert(legacyBookingPayload);
        if (legacyError) throw legacyError;
      }
      onSaved();
    } catch (error) {
      setFormError(errorMessage(error, "Could not save this house sitting stay."));
    } finally {
      setSaving(false);
    }
  }

  // Cancel/delete confirmations stack on top of this panel; the shared stack
  // sends the keypress to whichever is actually in front.
  useEscapeKey(onClose);

  return (
    <div className="fixed inset-0 z-[60] bg-[#1A1916]/20 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="slide-over-panel ml-auto flex h-full w-full max-w-[620px] flex-col overflow-y-auto bg-page p-4 shadow-[0_20px_70px_rgba(48,38,24,0.18)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-[23px] font-medium leading-[1.15] tracking-[-0.01em] text-text-primary sm:text-[28px] sm:leading-[1.1]">
              {isEditing ? "House sitting details" : "Add house sitting"}
            </h2>
            <p className="mt-1 text-[14px] text-text-secondary sm:text-[15px]">
              {isEditing
                ? "Review the booked stay and update details when plans change."
                : "Log the booked stay without adding anyone to regular customers."}
            </p>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        {cancelled ? (
          <div className="mb-5 flex items-start gap-3 rounded-[18px] border border-border bg-subtle p-3.5">
            <CalendarX size={18} strokeWidth={1.6} className="mt-0.5 shrink-0 text-text-tertiary" />
            <p className="text-[13px] leading-snug text-text-secondary">
              This stay is cancelled. It stays on the calendar for reference but does not count toward booked nights or earnings.
            </p>
          </div>
        ) : null}

        <form className="space-y-5" onSubmit={saveBooking}>
          <FieldShell label="Customer" error={errors.customer_name}>
            <div ref={menuRef} className="relative">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary" size={17} strokeWidth={1.6} />
                <input
                  className={cn(
                    "focus-ring min-h-11 w-full rounded-xl border bg-subtle py-2 pl-11 pr-10 text-[16px] text-text-primary placeholder:text-text-tertiary transition duration-200 ease-in-out hover:border-border-emphasis",
                    errors.customer_name ? "border-danger" : "border-border"
                  )}
                  value={values.customer_name}
                  placeholder="Type or choose customer"
                  onChange={(event) => updateCustomerName(event.target.value)}
                  onFocus={() => setCustomerMenuOpen(true)}
                  onKeyDown={confirmCustomerName}
                />
                <ChevronDown
                  className={cn("absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary transition", customerMenuOpen && "rotate-180")}
                  size={18}
                  strokeWidth={1.6}
                />
              </div>

              {customerMenuOpen ? (
                <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-72 overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-[0_18px_48px_rgba(80,66,44,0.14)]">
                  {filteredCustomerOptions.map((option) => (
                    <button
                      key={option.key}
                      className="focus-ring flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-left transition hover:bg-subtle"
                      type="button"
                      onClick={() => chooseCustomer(option)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium text-text-primary">{option.label}</span>
                        <span className="block truncate text-[12px] text-text-tertiary">{option.petNames || option.address || "No saved details"}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-subtle px-2 py-1 text-[11px] font-medium capitalize text-text-secondary">
                        {option.source === "regular" ? "Regular" : "House sitting"}
                      </span>
                    </button>
                  ))}
                  {values.customer_name.trim() ? (
                    <div className="rounded-xl px-3 py-2 text-[13px] text-text-secondary">
                      Saving without choosing a match creates a house-sitting-only customer.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </FieldShell>

          {canChangeOwner ? (
            <FieldShell label="Owner" error={errors.owner}>
              <div ref={ownerMenuRef} className="relative">
                <button
                  className={cn(
                    "focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border bg-subtle px-4 text-left text-[16px] text-text-primary transition duration-200 ease-in-out hover:border-border-emphasis",
                    errors.owner ? "border-danger" : "border-border"
                  )}
                  type="button"
                  disabled={ownerSelectOptions.length === 0}
                  onClick={() => setOwnerMenuOpen((open) => !open)}
                >
                  <span className="truncate">{ownerSelectOptions.length === 0 ? "Loading owners..." : ownerLabel(ownerId)}</span>
                  <ChevronDown
                    className={cn("shrink-0 text-text-tertiary transition duration-200", ownerMenuOpen && "rotate-180")}
                    size={18}
                    strokeWidth={1.6}
                  />
                </button>
                {ownerMenuOpen ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-64 overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-[0_18px_48px_rgba(80,66,44,0.14)]">
                    {ownerSelectOptions.map((owner) => (
                      <button
                        key={owner.id}
                        className={cn(
                          "focus-ring flex min-h-10 w-full items-center rounded-xl px-3 text-left text-[14px] font-medium transition duration-150 ease-out",
                          owner.id === ownerId ? "bg-accent-soft text-text-primary" : "text-text-secondary hover:bg-subtle"
                        )}
                        type="button"
                        onClick={() => updateOwner(owner.id)}
                      >
                        <span className="truncate">{owner.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </FieldShell>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              label="Start date"
              value={values.start_date}
              error={errors.start_date}
              dimFutureDates={false}
              onChange={(nextDate) => update("start_date", nextDate)}
            />
            <DateField
              label="Finish date"
              value={values.end_date}
              error={errors.end_date}
              dimFutureDates={false}
              onChange={(nextDate) => update("end_date", nextDate)}
            />
          </div>

          <AddressAutocomplete
            label="Address"
            value={values.address}
            error={errors.address}
            placeholder="Search by address or building name"
            onChange={(nextAddress) => update("address", nextAddress)}
          />

          <div className="space-y-3">
            {values.pets.length > 0 ? (
              <div className="space-y-3">
                {values.pets.map((pet, index) => (
                  <div key={index} className="rounded-[20px] border border-border bg-surface p-3.5 shadow-card sm:p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
                      <Input
                        label="Pet name"
                        value={pet.name}
                        placeholder="Coco"
                        onChange={(event) => updatePet(index, { name: event.target.value })}
                      />
                      <div className="grid grid-cols-[1fr_auto] items-end gap-3 sm:contents">
                        <Select
                          label="Type"
                          value={pet.type}
                          onChange={(event) => updatePet(index, { type: event.target.value as PetType })}
                        >
                          {PET_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </Select>
                        <Button
                          className="min-w-11 px-3"
                          variant="ghost"
                          type="button"
                          onClick={() => removePet(index)}
                          aria-label="Remove pet"
                        >
                          <Minus size={18} strokeWidth={1.6} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <Button className="w-full sm:w-auto" variant="soft" type="button" onClick={addPet}>
              <Plus size={16} strokeWidth={1.8} />
              Add pet
            </Button>
            {errors.pets ? <p className="text-[12px] text-danger">{errors.pets}</p> : null}
          </div>

          <section className="rounded-[20px] border border-border bg-surface p-3.5 shadow-card sm:p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldShell label="Payment method">
                <div className="grid min-h-11 grid-cols-3 rounded-2xl border border-border bg-subtle p-1">
                  {CLIENT_PAYMENT_METHODS.map((method) => (
                    <button
                      key={method}
                      className={cn(
                        "focus-ring rounded-xl text-[13px] font-medium transition duration-150 ease-out sm:text-[14px]",
                        values.payment_method === method ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary"
                      )}
                      onClick={() => update("payment_method", method)}
                      type="button"
                    >
                      <span className="flex min-w-0 items-center justify-center gap-1.5">
                        <ClientPaymentIcon method={method} />
                        <span className="truncate">{method}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </FieldShell>
              <Input
                label="Price per night"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={values.nightly_rate}
                error={errors.nightly_rate}
                placeholder="90.00"
                onChange={(event) => update("nightly_rate", event.target.value)}
              />
            </div>
          </section>

          <section className="rounded-[20px] border border-border bg-[#FFFEFB] p-3.5 shadow-card sm:p-4">
            <div className="flex items-center gap-2 text-[15px] font-medium text-text-primary">
              <Sparkles size={17} strokeWidth={1.6} className="text-accent" />
              Stay estimate
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
              <EstimateMetric label="Nights" value={String(estimate.nights)} />
              <EstimateMetric label="Gross" value={formatCurrency(estimate.gross)} />
              <EstimateMetric label={values.payment_method === "Rover" ? "After fee" : "Net"} value={formatCurrency(estimate.net)} />
              <EstimateMetric label="Taxable" value={estimate.taxable ? "Yes" : "No"} />
            </div>
            {values.payment_method === "Rover" ? (
              <p className="mt-3 text-[13px] text-text-secondary">
                Rover commission is estimated at {Math.round(ROVER_COMMISSION_RATE * 100)}%.
              </p>
            ) : null}
          </section>

          {formError ? <p className="text-[13px] text-danger">{formError}</p> : null}

          {isEditing && booking ? (
            <section className="rounded-[20px] border border-border bg-surface p-3.5 shadow-card sm:p-4">
              <h3 className="text-[13px] font-medium uppercase tracking-[0.04em] text-text-tertiary">Manage this stay</h3>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button
                  className="w-full sm:flex-1"
                  variant="soft"
                  type="button"
                  onClick={() => onRequestAction({ type: cancelled ? "restore" : "cancel", booking })}
                >
                  {cancelled ? <RotateCcw size={17} strokeWidth={1.7} /> : <CalendarX size={17} strokeWidth={1.7} />}
                  {cancelled ? "Restore stay" : "Cancel stay"}
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  variant="danger"
                  type="button"
                  onClick={() => onRequestAction({ type: "delete", booking })}
                >
                  <Trash2 size={17} strokeWidth={1.7} />
                  Delete
                </Button>
              </div>
              <p className="mt-2.5 text-[12px] leading-snug text-text-secondary">
                Cancelling keeps the stay on the calendar as a record. Deleting removes it permanently.
              </p>
            </section>
          ) : null}

          <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-border bg-page/90 px-4 py-4 pb-[calc(16px+env(safe-area-inset-bottom))] backdrop-blur-xl sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            <Button className="w-full" variant="accent" type="submit" disabled={saving}>
              {saving ? "Saving..." : isEditing ? "Save changes" : "Add house sitting"}
            </Button>
            <Button className="w-11 shrink-0 px-0" variant="soft" type="button" onClick={onClose} aria-label="Cancel">
              <X size={18} strokeWidth={1.6} />
            </Button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function EstimateMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-[82px] min-w-0 flex-col justify-between overflow-hidden rounded-2xl bg-subtle p-3 sm:h-[94px]">
      <div className="line-clamp-2 min-h-[28px] text-[11px] font-medium uppercase leading-[1.25] tracking-[0.04em] text-text-tertiary">
        {label}
      </div>
      <div className="truncate text-[17px] font-medium tabular-nums leading-none text-text-primary sm:text-[clamp(15px,3.6vw,18px)]">
        {value}
      </div>
    </div>
  );
}

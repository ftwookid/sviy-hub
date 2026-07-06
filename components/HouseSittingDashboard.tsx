"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BedDouble,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  Minus,
  Moon,
  Plus,
  Search,
  Sparkles,
  X
} from "lucide-react";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { ClientPaymentIcon } from "@/components/ClientPaymentBadge";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { FieldShell, Input, Select } from "@/components/ui/Field";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
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
  nightsBetween,
  startOfWeek
} from "@/lib/houseSitting";
import { formatCurrency, parseLocalDate, todayInputValue, toInputDate } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
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
  isAdmin: boolean;
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

type FormErrors = Partial<Record<keyof HouseSittingFormValues | "owner", string>>;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function defaultValues(): HouseSittingFormValues {
  const today = todayInputValue();
  return {
    customer_name: "",
    address: "",
    pets: [],
    payment_method: "Rover",
    start_date: today,
    end_date: today,
    nightly_rate: ""
  };
}

function valuesFromBooking(booking?: HouseSittingBooking): HouseSittingFormValues {
  if (!booking) return defaultValues();
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

function monthTitle(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
}

function isSameMonth(date: Date, cursorDate: Date) {
  return date.getFullYear() === cursorDate.getFullYear() && date.getMonth() === cursorDate.getMonth();
}

function bookingSort(a: HouseSittingBooking, b: HouseSittingBooking) {
  return a.start_date.localeCompare(b.start_date) || a.customer_name.localeCompare(b.customer_name);
}

function paymentTone(method: ClientPaymentMethod) {
  if (method === "Rover") return "bg-success-soft text-success";
  if (method === "Venmo") return "bg-blue-100 text-blue-700";
  return "bg-[#F1F0ED] text-text-secondary";
}

function customerPets(client: ClientWithPets) {
  return client.pets.map((pet) => pet.name).filter(Boolean).join(", ");
}

function customerPetRecords(client: ClientWithPets): HouseSittingPet[] {
  return client.pets.map((pet) => ({ name: pet.name, type: pet.type }));
}

function petsLabel(pets: HouseSittingPet[]) {
  return pets.map((pet) => pet.name.trim()).filter(Boolean).join(", ");
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
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, type: "Dog" as PetType }));
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

function isMissingPetsColumn(error: unknown) {
  const postgrestError = error as { code?: string; message?: string } | null;
  const message = postgrestError?.message ?? "";
  return (postgrestError?.code === "42703" || postgrestError?.code === "PGRST204") && message.includes("pets");
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  const postgrestError = error as { message?: string } | null;
  return postgrestError?.message ?? fallback;
}

export function HouseSittingDashboard({ userId, isAdmin, regularClients }: HouseSittingDashboardProps) {
  const [bookings, setBookings] = useState<HouseSittingBooking[]>([]);
  const [houseCustomers, setHouseCustomers] = useState<HouseSittingCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<HouseSittingBooking | null>(null);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [calendarView, setCalendarView] = useState<HouseSittingCalendarView>("month");
  const [cursorDate, setCursorDate] = useState(() => parseLocalDate(todayInputValue()));

  const loadHouseSitting = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    const bookingQuery = supabase.from("house_sittings").select("*").order("start_date", { ascending: true });
    const customerQuery = supabase.from("house_sitting_customers").select("*").order("name", { ascending: true });

    if (!isAdmin) {
      bookingQuery.eq("user_id", userId);
      customerQuery.eq("user_id", userId);
    }

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
    setBookings((bookingData ?? []) as HouseSittingBooking[]);
    setHouseCustomers((customerData ?? []) as HouseSittingCustomer[]);
    setLoading(false);
  }, [isAdmin, userId]);

  useEffect(() => {
    loadHouseSitting();
  }, [loadHouseSitting]);

  useEffect(() => {
    if (!isAdmin || !supabase) {
      setOwnerOptions([]);
      return;
    }

    let active = true;

    async function loadOwners() {
      const {
        data: { session }
      } = await supabase!.auth.getSession();

      if (!session?.access_token) {
        if (active) setOwnerOptions([]);
        return;
      }

      try {
        const response = await fetch("/api/admin/users", {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });

        if (!response.ok) throw new Error("Could not load owners.");

        const body = (await response.json()) as { users?: OwnerOption[] };
        if (active) setOwnerOptions(body.users ?? []);
      } catch {
        if (active) setOwnerOptions([]);
      }
    }

    loadOwners();

    return () => {
      active = false;
    };
  }, [isAdmin]);

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
    const upcoming = bookings.filter((booking) => booking.end_date >= today).sort(bookingSort);
    const monthBookings = bookings.filter((booking) => bookingOverlapsRange(booking, monthStart, monthEnd));
    const yearBookings = bookings.filter((booking) => bookingOverlapsRange(booking, yearStart, yearEnd));
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

  function moveCursor(offset: number) {
    setCursorDate((current) => {
      if (calendarView === "week") return addDays(current, offset * 7);
      if (calendarView === "year") return addYears(current, offset);
      return addMonths(current, offset);
    });
  }

  function openNewStay() {
    setEditingBooking(null);
    setFormOpen(true);
  }

  function openBooking(booking: HouseSittingBooking) {
    setEditingBooking(booking);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingBooking(null);
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <section className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-card">
        <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[22px] font-medium leading-tight text-text-primary">House sitting calendar</h2>
            <p className="mt-1 text-[14px] text-text-secondary">Past and future overnight stays, separate from regular walks.</p>
          </div>
          <Button variant="accent" onClick={openNewStay}>
            <Plus size={18} strokeWidth={1.6} />
            Add stay
          </Button>
        </div>

        <div className="flex flex-col gap-3 border-b border-border bg-[#FFFEFB] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid min-h-11 grid-cols-3 rounded-2xl border border-border bg-subtle p-1 sm:w-fit">
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
            <Button className="h-11 w-11 px-0" variant="soft" onClick={() => moveCursor(-1)} aria-label="Previous period">
              <ChevronLeft size={18} strokeWidth={1.7} />
            </Button>
            <button
              className="focus-ring min-h-11 min-w-0 rounded-xl px-3 text-center text-[16px] font-medium text-text-primary transition hover:bg-subtle sm:min-w-48"
              type="button"
              onClick={() => setCursorDate(parseLocalDate(todayInputValue()))}
            >
              {titleForView(calendarView, cursorDate)}
            </button>
            <Button className="h-11 w-11 px-0" variant="soft" onClick={() => moveCursor(1)} aria-label="Next period">
              <ChevronRight size={18} strokeWidth={1.7} />
            </Button>
          </div>
        </div>

        <div className="p-4">
          {loading ? <SkeletonRows /> : null}
          {!loading && loadError ? (
            <section className="rounded-[20px] border border-warning/30 bg-warning-soft px-5 py-6">
              <h3 className="text-[18px] font-medium text-text-primary">House sitting needs database setup</h3>
              <p className="mt-2 text-[14px] text-text-secondary">{loadError}</p>
            </section>
          ) : null}
          {!loading && !loadError && bookings.length === 0 ? (
            <section className="rounded-[20px] border border-border bg-page px-5 py-12 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-accent-soft">
                <Home size={28} strokeWidth={1.5} className="text-accent" />
              </div>
              <h3 className="mt-5 text-[20px] font-medium text-text-primary">No house sitting stays yet</h3>
              <p className="mx-auto mt-2 max-w-sm text-[14px] text-text-secondary">
                Add a booked date range and it will appear on the calendar for weekly, monthly, and yearly planning.
              </p>
              <Button className="mt-5" variant="accent" onClick={openNewStay}>
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
                  ownerLabels={isAdmin ? ownerLabels : {}}
                  onOpenBooking={openBooking}
                />
              ) : null}
              {calendarView === "month" ? (
                <MonthCalendar
                  cursorDate={cursorDate}
                  bookings={bookings}
                  ownerLabels={isAdmin ? ownerLabels : {}}
                  onOpenBooking={openBooking}
                />
              ) : null}
              {calendarView === "year" ? (
                <YearCalendar
                  cursorDate={cursorDate}
                  bookings={bookings}
                  ownerLabels={isAdmin ? ownerLabels : {}}
                  onOpenBooking={openBooking}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      {!loading && !loadError && bookings.length > 0 ? (
        <BookingList bookings={bookings} ownerLabels={isAdmin ? ownerLabels : {}} onOpenBooking={openBooking} />
      ) : null}

      {formOpen ? (
        <HouseSittingForm
          booking={editingBooking ?? undefined}
          userId={userId}
          canChangeOwner={isAdmin}
          ownerOptions={ownerOptions}
          regularClients={regularClients}
          houseCustomers={houseCustomers}
          onClose={closeForm}
          onSaved={() => {
            closeForm();
            loadHouseSitting();
          }}
        />
      ) : null}
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
    <div className="min-h-[128px] rounded-[18px] border border-border bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">{label}</div>
          <div className="mt-2 truncate text-[26px] font-medium leading-none text-text-primary">{value}</div>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[16px] bg-accent-soft text-accent">
          <Icon size={18} strokeWidth={1.6} />
        </span>
      </div>
      <p className="mt-4 line-clamp-2 text-[14px] leading-snug text-text-secondary">{detail}</p>
    </div>
  );
}

function WeekCalendar({
  cursorDate,
  bookings,
  ownerLabels,
  onOpenBooking
}: {
  cursorDate: Date;
  bookings: HouseSittingBooking[];
  ownerLabels: Record<string, string>;
  onOpenBooking: (booking: HouseSittingBooking) => void;
}) {
  const weekStart = startOfWeek(cursorDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <div className="grid gap-2 lg:grid-cols-7">
      {days.map((date) => {
        const dateBookings = bookings.filter((booking) => bookingOverlapsDate(booking, date)).sort(bookingSort);
        return (
          <CalendarDayCell
            key={toInputDate(date)}
            date={date}
            bookings={dateBookings}
            ownerLabels={ownerLabels}
            compact={false}
            onOpenBooking={onOpenBooking}
          />
        );
      })}
    </div>
  );
}

function MonthCalendar({
  cursorDate,
  bookings,
  ownerLabels,
  onOpenBooking
}: {
  cursorDate: Date;
  bookings: HouseSittingBooking[];
  ownerLabels: Record<string, string>;
  onOpenBooking: (booking: HouseSittingBooking) => void;
}) {
  return (
    <div>
      <div className="hidden grid-cols-7 gap-2 pb-2 text-center text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary lg:grid">
        {WEEK_DAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="grid gap-2 lg:grid-cols-7">
        {calendarMonthDays(cursorDate).map((date) => {
          const dateBookings = bookings.filter((booking) => bookingOverlapsDate(booking, date)).sort(bookingSort);
          return (
            <CalendarDayCell
              key={toInputDate(date)}
              date={date}
              bookings={dateBookings}
              ownerLabels={ownerLabels}
              muted={!isSameMonth(date, cursorDate)}
              compact
              onOpenBooking={onOpenBooking}
            />
          );
        })}
      </div>
    </div>
  );
}

function CalendarDayCell({
  date,
  bookings,
  ownerLabels,
  muted = false,
  compact,
  onOpenBooking
}: {
  date: Date;
  bookings: HouseSittingBooking[];
  ownerLabels: Record<string, string>;
  muted?: boolean;
  compact: boolean;
  onOpenBooking: (booking: HouseSittingBooking) => void;
}) {
  const today = toInputDate(date) === todayInputValue();
  return (
    <div
      className={cn(
        "min-h-[118px] rounded-[18px] border border-border bg-[#FFFEFB] p-2.5",
        muted && "bg-page/60 text-text-tertiary",
        bookings.length > 0 && "border-accent/50 bg-accent-soft/35"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "grid h-7 w-7 place-items-center rounded-full text-[13px] font-medium",
            today ? "bg-accent text-text-primary" : "text-text-secondary",
            muted && !today && "text-text-tertiary"
          )}
        >
          {date.getDate()}
        </span>
        {bookings.length > 0 ? <span className="text-[11px] font-medium text-accent">{bookings.length}</span> : null}
      </div>
      <div className="mt-2 space-y-1">
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
  onOpenBooking
}: {
  cursorDate: Date;
  bookings: HouseSittingBooking[];
  ownerLabels: Record<string, string>;
  onOpenBooking: (booking: HouseSittingBooking) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 12 }, (_, month) => {
        const start = toInputDate(new Date(cursorDate.getFullYear(), month, 1));
        const end = toInputDate(new Date(cursorDate.getFullYear(), month + 1, 0));
        const monthBookings = bookings.filter((booking) => bookingOverlapsRange(booking, start, end)).sort(bookingSort);
        const nights = monthBookings.reduce((total, booking) => total + nightsBetween(booking.start_date, booking.end_date), 0);
        const net = monthBookings.reduce(
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
          <div key={month} className="min-h-[156px] rounded-[18px] border border-border bg-[#FFFEFB] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-medium text-text-primary">{monthTitle(new Date(cursorDate.getFullYear(), month, 1))}</h3>
                <p className="mt-1 text-[13px] text-text-secondary">
                  {nights} {nights === 1 ? "night" : "nights"} booked
                </p>
              </div>
              <span className="text-[13px] font-medium tabular-nums text-text-secondary">{formatCurrency(net)}</span>
            </div>
            <div className="mt-3 space-y-1">
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
  return (
    <button
      className={cn(
        "focus-ring block w-full min-w-0 rounded-xl px-2 py-1 text-left text-[12px] font-medium transition hover:brightness-[0.98]",
        paymentTone(booking.payment_method)
      )}
      type="button"
      onClick={() => onOpenBooking(booking)}
      title={label ? `${booking.customer_name} · ${label}` : booking.customer_name}
    >
      <div className="truncate">{booking.customer_name}</div>
      <div className="truncate text-[11px] opacity-75">{label || dateRangeLabel(booking.start_date, booking.end_date)}</div>
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
  const upcoming = bookings.filter((booking) => booking.end_date >= today).sort(bookingSort).slice(0, 6);
  const recent = bookings.filter((booking) => booking.end_date < today).sort((a, b) => b.end_date.localeCompare(a.end_date)).slice(0, 4);

  return (
    <section className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
      <div className="rounded-[24px] border border-border bg-surface p-4 shadow-card">
        <h2 className="text-[18px] font-medium text-text-primary">Upcoming stays</h2>
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
      <div className="rounded-[24px] border border-border bg-surface p-4 shadow-card">
        <h2 className="text-[18px] font-medium text-text-primary">Recently finished</h2>
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
  const estimate = estimateHouseSitting({
    startDate: booking.start_date,
    endDate: booking.end_date,
    nightlyRate: Number(booking.nightly_rate),
    paymentMethod: booking.payment_method,
    commissionRate: Number(booking.rover_commission_rate)
  });

  return (
    <button
      className="focus-ring flex w-full items-center justify-between gap-3 rounded-2xl bg-subtle px-3 py-3 text-left transition hover:bg-border"
      type="button"
      onClick={() => onOpenBooking(booking)}
    >
      <div className="min-w-0">
        <div className="truncate text-[15px] font-medium text-text-primary">{booking.customer_name}</div>
        <div className="mt-0.5 truncate text-[13px] text-text-secondary">{dateRangeLabel(booking.start_date, booking.end_date)}</div>
        {ownerLabel ? <div className="mt-0.5 truncate text-[12px] font-medium text-text-tertiary">{ownerLabel}</div> : null}
        {!compact ? <div className="mt-0.5 truncate text-[12px] text-text-tertiary">{booking.pet_names || "Pets not listed"}</div> : null}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[15px] font-medium tabular-nums text-text-primary">{formatCurrency(estimate.net)}</div>
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

function HouseSittingForm({
  booking,
  userId,
  canChangeOwner,
  ownerOptions,
  regularClients,
  houseCustomers,
  onClose,
  onSaved
}: {
  booking?: HouseSittingBooking;
  userId: string;
  canChangeOwner: boolean;
  ownerOptions: OwnerOption[];
  regularClients: ClientWithPets[];
  houseCustomers: HouseSittingCustomer[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = Boolean(booking);
  const [values, setValues] = useState<HouseSittingFormValues>(() => valuesFromBooking(booking));
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
    setSelectedCustomer(option);
    setValues((current) => ({
      ...current,
      customer_name: option.label,
      address: option.address || current.address,
      pets: option.pets.length > 0 ? option.pets : current.pets
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

  return (
    <div className="fixed inset-0 z-[60] bg-[#1A1916]/20 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="slide-over-panel ml-auto flex h-full w-full max-w-[620px] flex-col overflow-y-auto bg-page p-4 shadow-[0_20px_70px_rgba(48,38,24,0.18)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-text-primary">
              {isEditing ? "House sitting details" : "Add house sitting"}
            </h2>
            <p className="mt-1 text-[15px] text-text-secondary">
              {isEditing ? "Review the booked stay and update details when plans change." : "Log the booked stay without adding anyone to regular customers."}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={1.6} />
          </Button>
        </div>

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
            <DateField label="Start date" value={values.start_date} error={errors.start_date} onChange={(nextDate) => update("start_date", nextDate)} />
            <DateField label="Finish date" value={values.end_date} error={errors.end_date} onChange={(nextDate) => update("end_date", nextDate)} />
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
                  <div key={index} className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
                    <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
                      <Input
                        label="Pet name"
                        value={pet.name}
                        placeholder="Coco"
                        onChange={(event) => updatePet(index, { name: event.target.value })}
                      />
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
                ))}
              </div>
            ) : null}

            <Button variant="soft" type="button" onClick={addPet}>
              <Plus size={16} strokeWidth={1.8} />
              Add pet
            </Button>
            {errors.pets ? <p className="text-[12px] text-danger">{errors.pets}</p> : null}
          </div>

          <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldShell label="Payment method">
                <div className="grid min-h-11 grid-cols-3 rounded-2xl border border-border bg-subtle p-1">
                  {CLIENT_PAYMENT_METHODS.map((method) => (
                    <button
                      key={method}
                      className={cn(
                        "rounded-xl text-[14px] font-medium transition duration-150 ease-out",
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

          <section className="rounded-[20px] border border-border bg-[#FFFEFB] p-4 shadow-card">
            <div className="flex items-center gap-2 text-[15px] font-medium text-text-primary">
              <Sparkles size={17} strokeWidth={1.6} className="text-accent" />
              Stay estimate
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
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

          <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-border bg-page/90 px-4 py-4 backdrop-blur-xl sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            <Button className="w-full" variant="accent" type="submit" disabled={saving}>
              {saving ? "Saving..." : isEditing ? "Save changes" : "Add house sitting"}
            </Button>
            <Button variant="soft" type="button" onClick={onClose} aria-label="Cancel">
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
    <div className="flex h-[94px] min-w-0 flex-col justify-between overflow-hidden rounded-2xl bg-subtle p-3">
      <div className="line-clamp-2 min-h-[28px] text-[11px] font-medium uppercase leading-[1.25] tracking-[0.04em] text-text-tertiary">
        {label}
      </div>
      <div className="truncate font-medium tabular-nums leading-none text-text-primary text-[clamp(15px,3.6vw,18px)]">{value}</div>
    </div>
  );
}

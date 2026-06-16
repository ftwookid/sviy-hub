"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bird, CalendarDays, Cat, Check, ChevronLeft, ChevronRight, Dog, Edit3, MapPin, Pause, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CategoryTag } from "@/components/CategoryTag";
import { ClientForm } from "@/components/ClientForm";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { estimateClientEarnings, selectedDaysFromRecord } from "@/lib/clients";
import { formatCurrency, parseLocalDate, todayInputValue, toInputDate } from "@/lib/formatters";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { ClientStatus, ClientWithPets, PetType, PriceHistory, StatusHistory } from "@/types/client";

const petIcons = {
  Dog,
  Cat,
  Bird,
  Exotic: Sparkles
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function PetIcon({ type }: { type: PetType }) {
  const Icon = petIcons[type];
  return <Icon size={16} strokeWidth={1.6} className="text-text-secondary" />;
}

function statusTone(status: ClientStatus) {
  return status === "Active" ? "bg-success-soft text-success" : "bg-subtle text-text-secondary";
}

function dayBefore(dateValue: string) {
  const date = parseLocalDate(dateValue);
  date.setDate(date.getDate() - 1);
  return toInputDate(date);
}

function serviceLabel(client: ClientWithPets) {
  return client.service_type === "Custom" ? client.custom_service_type || "Custom" : client.service_type;
}

function currentHistory(client: ClientWithPets | null, history: StatusHistory[]) {
  if (!client) return null;
  return (
    history.find((entry) => entry.end_date === null && entry.status === client.status) ??
    history.find((entry) => entry.status === client.status) ??
    null
  );
}

function statusStartDate(client: ClientWithPets | null, history: StatusHistory[]) {
  const current = currentHistory(client, history);
  if (current) return current.start_date;
  if (client?.created_at) return toInputDate(new Date(client.created_at));
  return todayInputValue();
}

function formatExactDate(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parseLocalDate(dateValue));
}

function monthTitle(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
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

function isToday(date: Date) {
  return toInputDate(date) === todayInputValue();
}

function isFutureDate(date: Date) {
  return toInputDate(date) > todayInputValue();
}

function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function nearbyYears(date: Date) {
  const start = date.getFullYear() - 5;
  return Array.from({ length: 12 }, (_, index) => start + index);
}

function mapsUrl(address: string) {
  const query = encodeURIComponent(address);
  if (typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    return `http://maps.apple.com/?q=${query}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function displayAddress(address: string) {
  return address.replace(/,\s*USA$/i, "");
}

function earningsBreakdown(gross: number, commission: number) {
  return `${formatCurrency(gross)} gross${commission > 0 ? `, ${formatCurrency(commission)} Rover fee` : ""}`;
}

function daysBetweenInclusive(startValue: string, endValue: string) {
  const start = parseLocalDate(startValue);
  const end = parseLocalDate(endValue);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function currentPriceFromHistory(client: ClientWithPets | null, priceHistory: PriceHistory[]) {
  if (!client) return 0;
  const today = todayInputValue();
  const currentEntry = priceHistory
    .filter((entry) => entry.effective_date <= today)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];

  return Number(currentEntry?.price ?? client.price_per_visit);
}

function sortedPrices(priceHistory: PriceHistory[]) {
  return priceHistory.slice().sort((a, b) => b.effective_date.localeCompare(a.effective_date));
}

function DateCalendar({
  month,
  mode,
  selectedDate,
  onChangeMonth,
  onToggleMode,
  onSelectDate,
  onSelectYear,
  onSelectMonth
}: {
  month: Date;
  mode: "days" | "monthYear";
  selectedDate: string;
  onChangeMonth: (event: React.MouseEvent<HTMLButtonElement>, offset: number) => void;
  onToggleMode: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onSelectDate: (event: React.MouseEvent<HTMLButtonElement>, date: Date) => void;
  onSelectYear: (event: React.MouseEvent<HTMLButtonElement>, year: number) => void;
  onSelectMonth: (event: React.MouseEvent<HTMLButtonElement>, month: number) => void;
}) {
  return (
    <div className="mt-2 rounded-2xl border border-border bg-page p-3">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <button
          className="focus-ring inline-grid h-9 w-9 place-items-center rounded-xl text-text-tertiary transition hover:bg-subtle hover:text-text-primary"
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => onChangeMonth(event, -1)}
          aria-label="Previous month"
        >
          <ChevronLeft size={17} strokeWidth={1.7} />
        </button>
        <button
          className="focus-ring min-h-9 rounded-xl px-3 text-[15px] font-medium text-text-primary transition hover:bg-subtle"
          type="button"
          onClick={onToggleMode}
        >
          {monthTitle(month)}
        </button>
        <button
          className="focus-ring inline-grid h-9 w-9 place-items-center rounded-xl text-text-tertiary transition hover:bg-subtle hover:text-text-primary"
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => onChangeMonth(event, 1)}
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
            {calendarDays(month).map((date, index) =>
              date ? (
                <button
                  key={toInputDate(date)}
                  className={cn(
                    "focus-ring relative grid h-9 place-items-center rounded-xl text-[13px] font-medium transition",
                    selectedDate === toInputDate(date)
                      ? "bg-accent text-text-primary shadow-sm"
                      : "text-text-secondary hover:bg-subtle hover:text-text-primary",
                    isFutureDate(date) && selectedDate !== toInputDate(date) && "text-text-tertiary opacity-40 hover:opacity-70"
                  )}
                  type="button"
                  onClick={(event) => onSelectDate(event, date)}
                >
                  {date.getDate()}
                  {isToday(date) ? (
                    <span
                      className={cn(
                        "absolute bottom-1 h-1 w-1 rounded-full",
                        selectedDate === toInputDate(date) ? "bg-text-primary" : "bg-accent"
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
            {nearbyYears(month).map((year) => (
              <button
                key={year}
                className={cn(
                  "focus-ring min-h-9 rounded-xl text-[13px] font-medium transition",
                  month.getFullYear() === year ? "bg-accent text-text-primary shadow-sm" : "text-text-secondary hover:bg-subtle hover:text-text-primary"
                )}
                type="button"
                onClick={(event) => onSelectYear(event, year)}
              >
                {year}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTH_NAMES.map((monthName, index) => (
              <button
                key={monthName}
                className={cn(
                  "focus-ring min-h-9 rounded-xl text-[13px] font-medium transition",
                  month.getMonth() === index ? "bg-accent text-text-primary shadow-sm" : "text-text-secondary hover:bg-subtle hover:text-text-primary"
                )}
                type="button"
                onClick={(event) => onSelectMonth(event, index)}
              >
                {monthName}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClientDetailPage() {
  const sinceCalendarRef = useRef<HTMLDivElement>(null);
  const suppressPriceHistoryClickUntilRef = useRef(0);
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const { user, isAdmin, authLoading } = useAuthUser();
  const [client, setClient] = useState<ClientWithPets | null>(null);
  const [history, setHistory] = useState<StatusHistory[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState<PriceHistory | null>(null);
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false);
  const [priceValue, setPriceValue] = useState("");
  const [priceEffectiveDate, setPriceEffectiveDate] = useState(todayInputValue());
  const [priceCalendarMonth, setPriceCalendarMonth] = useState(() => parseLocalDate(todayInputValue()));
  const [priceCalendarMode, setPriceCalendarMode] = useState<"days" | "monthYear">("days");
  const [savingPrice, setSavingPrice] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusDate, setStatusDate] = useState(todayInputValue());
  const [statusCalendarMonth, setStatusCalendarMonth] = useState(() => parseLocalDate(todayInputValue()));
  const [statusCalendarMode, setStatusCalendarMode] = useState<"days" | "monthYear">("days");
  const [sinceCalendarOpen, setSinceCalendarOpen] = useState(false);
  const [sinceCalendarMonth, setSinceCalendarMonth] = useState(() => parseLocalDate(todayInputValue()));
  const [sinceCalendarMode, setSinceCalendarMode] = useState<"days" | "monthYear">("days");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingSinceDate, setSavingSinceDate] = useState(false);

  const loadClient = useCallback(async () => {
    if (!supabase || !user || !clientId) return;
    setLoading(true);
    setError("");

    let clientQuery = supabase.from("clients").select("*, pets(*)").eq("id", clientId);
    if (!isAdmin) clientQuery = clientQuery.eq("user_id", user.id);

    const [
      { data: clientData, error: clientError },
      { data: historyData, error: historyError },
      { data: priceData, error: priceError }
    ] = await Promise.all([
      clientQuery.single(),
      supabase.from("status_history").select("*").eq("client_id", clientId).order("start_date", { ascending: false }),
      supabase.from("price_history").select("*").eq("client_id", clientId).order("effective_date", { ascending: false })
    ]);

    if (clientError) {
      setError(clientError.message);
      setClient(null);
      setHistory([]);
    } else {
      const nextClient = clientData as ClientWithPets & { pets: ClientWithPets["pets"] | null };
      setClient({ ...nextClient, pets: nextClient.pets ?? [] });
      setHistory((historyData ?? []) as StatusHistory[]);
      setPriceHistory((priceData ?? []) as PriceHistory[]);
      if (historyError || priceError) setError(historyError?.message ?? priceError?.message ?? "");
    }

    setLoading(false);
  }, [clientId, isAdmin, user]);

  useEffect(() => {
    loadClient();
  }, [loadClient]);

  useEffect(() => {
    if (!sinceCalendarOpen) return;

    function closeSinceCalendarOnOutsideClick(event: PointerEvent) {
      if (!sinceCalendarRef.current?.contains(event.target as Node)) {
        setSinceCalendarOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeSinceCalendarOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeSinceCalendarOnOutsideClick);
  }, [sinceCalendarOpen]);

  const nextStatus: ClientStatus = client?.status === "Active" ? "Paused" : "Active";
  const currentStatusHistory = currentHistory(client, history);
  const currentStatusStartDate = statusStartDate(client, history);
  const selectedDays = client ? selectedDaysFromRecord(client.frequency_label, client.visits_per_week) : [];
  const currentPrice = currentPriceFromHistory(client, priceHistory);
  const estimate = client
    ? estimateClientEarnings({
        pricePerVisit: currentPrice,
        visitsPerWeek: selectedDays.length,
        paymentMethod: client.payment_method,
        commissionRate: Number(client.rover_commission_rate)
      })
    : null;
  const orderedPriceHistory = useMemo(() => sortedPrices(priceHistory), [priceHistory]);
  const hasAnyPriceHistory = priceHistory.length > 0;
  const totalEstimate = useMemo(() => {
    if (!client) {
      return {
        gross: 0,
        commission: 0,
        net: 0
      };
    }

    const today = todayInputValue();
    const ascendingPrices = priceHistory
      .slice()
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
    const fallbackPrice = {
      id: "current",
      client_id: client.id,
      price: Number(client.price_per_visit),
      effective_date: currentStatusStartDate,
      created_at: client.created_at
    };
    const seededPrices =
      ascendingPrices.length === 0 || ascendingPrices[0].effective_date > currentStatusStartDate
        ? [fallbackPrice, ...ascendingPrices]
        : ascendingPrices;

    let gross = 0;

    for (let index = 0; index < seededPrices.length; index += 1) {
      const entry = seededPrices[index];
      const nextEntry = seededPrices[index + 1];
      const periodStart = entry.effective_date < currentStatusStartDate ? currentStatusStartDate : entry.effective_date;
      const periodEnd = nextEntry ? dayBefore(nextEntry.effective_date) : today;

      if (periodEnd >= currentStatusStartDate && periodStart <= today && periodEnd >= periodStart) {
        const days = daysBetweenInclusive(periodStart, periodEnd);
        gross += Number(entry.price) * selectedDays.length * (days / 7);
      }
    }

    const commission = client.payment_method === "Rover" ? gross * Number(client.rover_commission_rate) : 0;
    return {
      gross,
      commission,
      net: gross - commission
    };
  }, [client, currentStatusStartDate, priceHistory, selectedDays.length]);

  const timeline = useMemo(() => history.slice().sort((a, b) => b.start_date.localeCompare(a.start_date)), [history]);

  function openStatusModal() {
    const today = todayInputValue();
    setStatusDate(today);
    setStatusCalendarMonth(parseLocalDate(today));
    setStatusCalendarMode("days");
    setStatusModalOpen(true);
  }

  function changeCalendarMonth(event: React.MouseEvent<HTMLButtonElement>, offset: number) {
    event.preventDefault();
    event.stopPropagation();
    setStatusCalendarMonth((current) => addMonths(current, offset));
  }

  function openSinceCalendar(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setSinceCalendarMonth(parseLocalDate(currentStatusStartDate));
    setSinceCalendarMode("days");
    setSinceCalendarOpen((open) => !open);
  }

  function changeSinceCalendarMonth(event: React.MouseEvent<HTMLButtonElement>, offset: number) {
    event.preventDefault();
    event.stopPropagation();
    setSinceCalendarMonth((current) => addMonths(current, offset));
  }

  async function selectSinceDate(event: React.MouseEvent<HTMLButtonElement>, date: Date) {
    event.preventDefault();
    event.stopPropagation();
    await updateSinceDate(toInputDate(date));
    setSinceCalendarOpen(false);
  }

  function selectStatusDate(event: React.MouseEvent<HTMLButtonElement>, date: Date) {
    event.preventDefault();
    event.stopPropagation();
    setStatusDate(toInputDate(date));
  }

  function toggleStatusCalendarMode(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setStatusCalendarMode((mode) => (mode === "days" ? "monthYear" : "days"));
  }

  function toggleSinceCalendarMode(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setSinceCalendarMode((mode) => (mode === "days" ? "monthYear" : "days"));
  }

  function selectStatusCalendarYear(event: React.MouseEvent<HTMLButtonElement>, year: number) {
    event.preventDefault();
    event.stopPropagation();
    setStatusCalendarMonth((current) => new Date(year, current.getMonth(), 1));
  }

  function selectStatusCalendarMonth(event: React.MouseEvent<HTMLButtonElement>, month: number) {
    event.preventDefault();
    event.stopPropagation();
    setStatusCalendarMonth((current) => new Date(current.getFullYear(), month, 1));
    setStatusCalendarMode("days");
  }

  function selectSinceCalendarYear(event: React.MouseEvent<HTMLButtonElement>, year: number) {
    event.preventDefault();
    event.stopPropagation();
    setSinceCalendarMonth((current) => new Date(year, current.getMonth(), 1));
  }

  function selectSinceCalendarMonth(event: React.MouseEvent<HTMLButtonElement>, month: number) {
    event.preventDefault();
    event.stopPropagation();
    setSinceCalendarMonth((current) => new Date(current.getFullYear(), month, 1));
    setSinceCalendarMode("days");
  }

  async function changeStatus() {
    if (!supabase || !client || !statusDate) return;
    setSavingStatus(true);
    setError("");

    const previousEndDate = dayBefore(statusDate);
    const { error: closeError } = await supabase
      .from("status_history")
      .update({ end_date: previousEndDate })
      .eq("client_id", client.id)
      .is("end_date", null);

    if (closeError) {
      setError(closeError.message);
      setSavingStatus(false);
      return;
    }

    const { error: insertError } = await supabase.from("status_history").insert({
      client_id: client.id,
      status: nextStatus,
      start_date: statusDate
    });

    if (insertError) {
      setError(insertError.message);
      setSavingStatus(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("clients")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", client.id);

    if (updateError) {
      setError(updateError.message);
      setSavingStatus(false);
      return;
    }

    setStatusModalOpen(false);
    setSavingStatus(false);
    loadClient();
  }

  async function updateSinceDate(startDate: string) {
    if (!supabase || !client || !startDate || startDate === currentStatusStartDate) return;
    setSavingSinceDate(true);
    setError("");

    const statusError = currentStatusHistory
      ? (
          await supabase
            .from("status_history")
            .update({ start_date: startDate })
            .eq("id", currentStatusHistory.id)
        ).error
      : (
          await supabase.from("status_history").insert({
            client_id: client.id,
            status: client.status,
            start_date: startDate
          })
        ).error;

    if (statusError) {
      setError(statusError.message);
      setSavingSinceDate(false);
      return;
    }

    const previousEntry = timeline.find((entry) => entry.id !== currentStatusHistory?.id && entry.start_date < startDate);
    if (previousEntry) {
      const { error: previousError } = await supabase
        .from("status_history")
        .update({ end_date: dayBefore(startDate) })
        .eq("id", previousEntry.id);

      if (previousError) {
        setError(previousError.message);
        setSavingSinceDate(false);
        return;
      }
    }

    setSavingSinceDate(false);
    loadClient();
  }

  async function syncClientCurrentPrice(nextPriceHistory: PriceHistory[]) {
    if (!supabase || !client) return;
    const nextCurrentPrice = currentPriceFromHistory(client, nextPriceHistory);
    await supabase
      .from("clients")
      .update({ price_per_visit: Number(nextCurrentPrice.toFixed(2)), updated_at: new Date().toISOString() })
      .eq("id", client.id);
  }

  function openPriceModal(entry?: PriceHistory, prefilledDate?: string) {
    const effectiveDate = entry?.effective_date ?? prefilledDate ?? todayInputValue();
    setEditingPrice(entry ?? null);
    setPriceValue(entry ? String(entry.price) : String(currentPrice || ""));
    setPriceEffectiveDate(effectiveDate);
    setPriceCalendarMonth(parseLocalDate(effectiveDate));
    setPriceCalendarMode("days");
    setPriceModalOpen(true);
  }

  function openStartingPriceModal() {
    setSinceCalendarOpen(false);
    openPriceModal(undefined, currentStatusStartDate);
  }

  function togglePriceHistory() {
    setPriceHistoryOpen((open) => !open);
  }

  function closePriceModal() {
    setPriceModalOpen(false);
    setEditingPrice(null);
    setPriceValue("");
    setPriceEffectiveDate(todayInputValue());
  }

  function changePriceCalendarMonth(event: React.MouseEvent<HTMLButtonElement>, offset: number) {
    event.preventDefault();
    event.stopPropagation();
    setPriceCalendarMonth((current) => addMonths(current, offset));
  }

  function selectPriceDate(event: React.MouseEvent<HTMLButtonElement>, date: Date) {
    event.preventDefault();
    event.stopPropagation();
    setPriceEffectiveDate(toInputDate(date));
  }

  function togglePriceCalendarMode(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setPriceCalendarMode((mode) => (mode === "days" ? "monthYear" : "days"));
  }

  function selectPriceCalendarYear(event: React.MouseEvent<HTMLButtonElement>, year: number) {
    event.preventDefault();
    event.stopPropagation();
    setPriceCalendarMonth((current) => new Date(year, current.getMonth(), 1));
  }

  function selectPriceCalendarMonth(event: React.MouseEvent<HTMLButtonElement>, month: number) {
    event.preventDefault();
    event.stopPropagation();
    setPriceCalendarMonth((current) => new Date(current.getFullYear(), month, 1));
    setPriceCalendarMode("days");
  }

  async function savePriceHistory() {
    if (!supabase || !client) return;
    const nextPrice = Number(priceValue);
    if (!priceEffectiveDate || !Number.isFinite(nextPrice) || nextPrice < 0) {
      setError("Enter a valid price and effective date.");
      return;
    }

    setSavingPrice(true);
    setError("");

    const payload = {
      client_id: client.id,
      price: Number(nextPrice.toFixed(2)),
      effective_date: priceEffectiveDate
    };

    const { error: priceError } = editingPrice
      ? await supabase.from("price_history").update(payload).eq("id", editingPrice.id)
      : await supabase.from("price_history").insert(payload);

    if (priceError) {
      setError(priceError.message);
      setSavingPrice(false);
      return;
    }

    const nextHistory = editingPrice
      ? priceHistory.map((entry) => (entry.id === editingPrice.id ? { ...entry, ...payload } : entry))
      : [
          ...priceHistory,
          {
            id: "new",
            created_at: new Date().toISOString(),
            ...payload
          }
        ];

    await syncClientCurrentPrice(nextHistory as PriceHistory[]);
    setSavingPrice(false);
    closePriceModal();
    loadClient();
  }

  async function deletePriceHistory(entry: PriceHistory) {
    if (!supabase) return;
    const confirmed = window.confirm(`Delete ${formatCurrency(entry.price)} from ${formatExactDate(entry.effective_date)}?`);
    if (!confirmed) return;

    const { error: deleteError } = await supabase.from("price_history").delete().eq("id", entry.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await syncClientCurrentPrice(priceHistory.filter((item) => item.id !== entry.id));
    loadClient();
  }

  async function deleteClient() {
    if (!supabase || !client) return;
    const confirmed = window.confirm(`Delete ${client.name}? This will also remove their pets.`);
    if (!confirmed) return;

    const { error: deleteError } = await supabase.from("clients").delete().eq("id", client.id);
    if (deleteError) {
      window.alert(deleteError.message);
      return;
    }

    router.push("/clients");
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      <div className="space-y-7">
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-[15px] font-medium text-text-secondary transition hover:bg-subtle hover:text-text-primary"
          href="/clients"
        >
          <ArrowLeft size={18} strokeWidth={1.6} />
          Back to clients
        </Link>

        {loading ? <SkeletonRows /> : null}

        {!loading && error && !client ? (
          <section className="rounded-[20px] border border-border bg-surface p-6 shadow-card">
            <h1 className="text-[26px] font-medium text-text-primary">Client not found</h1>
            <p className="mt-2 text-[15px] text-text-secondary">{error}</p>
          </section>
        ) : null}

        {!loading && client && estimate ? (
          <>
            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-[38px] font-medium leading-[1.06] tracking-[-0.01em] text-text-primary">{client.name}</h1>
                <p className="mt-3 flex items-start gap-2 text-[16px] text-text-secondary">
                  <MapPin className="mt-0.5 shrink-0 text-text-tertiary" size={18} strokeWidth={1.6} />
                  {client.address ? (
                    <a className="transition hover:text-text-primary hover:underline" href={mapsUrl(client.address)} target="_blank" rel="noreferrer">
                      {displayAddress(client.address)}
                    </a>
                  ) : (
                    <span>No address saved</span>
                  )}
                </p>
              </div>
              <div className="hidden gap-2 sm:flex">
                {isAdmin && client.status === "Paused" ? (
                  <Button variant="danger" onClick={deleteClient}>
                    <Trash2 size={17} strokeWidth={1.6} />
                    Delete
                  </Button>
                ) : null}
                <Button variant="accent" onClick={() => setEditorOpen(true)}>
                  <Edit3 size={17} strokeWidth={1.6} />
                  Edit
                </Button>
              </div>
            </header>

            <section className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-[20px] border border-border bg-surface p-5 shadow-card">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-[18px] font-medium text-text-primary">Current status</h2>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium", statusTone(client.status))}>
                    {client.status === "Active" ? <Check size={14} strokeWidth={1.8} /> : <Pause size={14} strokeWidth={1.8} />}
                    {client.status}
                  </span>
                </div>
                <div ref={sinceCalendarRef} className="relative mt-4">
                  <span className="text-[13px] font-medium text-text-tertiary">Since</span>
                  <span className="relative mt-2 flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-border bg-page px-3 text-[14px] font-medium text-text-primary">
                    <span>{formatExactDate(currentStatusStartDate)}</span>
                    <button
                      className="focus-ring inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-tertiary transition hover:bg-subtle hover:text-text-primary"
                      type="button"
                      onClick={openSinceCalendar}
                      disabled={savingSinceDate}
                      aria-label="Edit status start date"
                    >
                      <Edit3 size={14} strokeWidth={1.7} />
                    </button>
                  </span>
                  {sinceCalendarOpen ? (
                    <div className="absolute left-0 right-0 top-[58px] z-50 rounded-2xl bg-surface shadow-[0_18px_48px_rgba(80,66,44,0.16)]">
                      <DateCalendar
                        month={sinceCalendarMonth}
                        mode={sinceCalendarMode}
                        selectedDate={currentStatusStartDate}
                        onChangeMonth={changeSinceCalendarMonth}
                        onToggleMode={toggleSinceCalendarMode}
                        onSelectDate={selectSinceDate}
                        onSelectYear={selectSinceCalendarYear}
                        onSelectMonth={selectSinceCalendarMonth}
                      />
                    </div>
                  ) : null}
                  {!hasAnyPriceHistory ? (
                    <p className="mt-2 text-[12px] leading-snug text-text-tertiary">
                      No price set for this date —{" "}
                      <button
                        className="focus-ring rounded-md font-medium text-text-secondary underline underline-offset-2 transition hover:text-text-primary"
                        type="button"
                        onClick={openStartingPriceModal}
                      >
                        add starting price
                      </button>
                    </p>
                  ) : null}
                </div>
                <Button className="mt-5" variant="soft" onClick={openStatusModal}>
                  <CalendarDays size={17} strokeWidth={1.6} />
                  Change status
                </Button>
              </div>

              <div className="rounded-[20px] border border-border bg-[#FFFEFB] p-5 shadow-card lg:hidden">
                <div className="grid grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-medium leading-snug text-text-primary">Monthly estimate</h2>
                    <div className="mt-3 flex flex-wrap items-baseline gap-1.5 text-text-primary">
                      <span className="text-[25px] font-medium leading-none">{formatCurrency(estimate.monthlyNet)}</span>
                      <span className="text-[13px] font-medium text-text-tertiary">/mo</span>
                    </div>
                    <p className="mt-2 text-[12px] leading-snug text-text-secondary">
                      {formatCurrency(estimate.monthlyGross)} gross
                      {client.payment_method === "Rover" ? `, ${formatCurrency(estimate.commission)} Rover fee` : ""}
                    </p>
                  </div>
                  <div className="min-w-0 border-l border-border pl-4">
                    <h2 className="text-[15px] font-medium leading-snug text-text-primary">Total earned</h2>
                    <div className="mt-3 text-text-primary">
                      <span className="text-[25px] font-medium leading-none">{formatCurrency(totalEstimate.net)}</span>
                    </div>
                    <p className="mt-2 text-[12px] leading-snug text-text-secondary">
                      since {formatExactDate(currentStatusStartDate)}
                    </p>
                    <p className="mt-1 text-[12px] leading-snug text-text-secondary">
                      {earningsBreakdown(totalEstimate.gross, totalEstimate.commission)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="hidden rounded-[20px] border border-border bg-[#FFFEFB] p-5 shadow-card lg:block">
                <h2 className="text-[18px] font-medium text-text-primary">Monthly estimate</h2>
                <div className="mt-4 flex items-baseline gap-2 text-text-primary">
                  <span className="text-[34px] font-medium leading-none">{formatCurrency(estimate.monthlyNet)}</span>
                  <span className="text-[14px] font-medium text-text-tertiary">/mo</span>
                </div>
                <p className="mt-3 text-[13px] text-text-secondary">
                  {formatCurrency(estimate.monthlyGross)} gross
                  {client.payment_method === "Rover" ? `, ${formatCurrency(estimate.commission)} Rover fee` : ""}
                </p>
              </div>

              <div className="hidden rounded-[20px] border border-border bg-[#FFFEFB] p-5 shadow-card lg:block">
                <h2 className="text-[18px] font-medium text-text-primary">Total earned</h2>
                <div className="mt-4 flex items-baseline gap-2 text-text-primary">
                  <span className="text-[34px] font-medium leading-none">{formatCurrency(totalEstimate.net)}</span>
                </div>
                <p className="mt-3 text-[13px] text-text-secondary">
                  since {formatExactDate(currentStatusStartDate)}
                </p>
                <p className="mt-1 text-[13px] text-text-secondary">
                  {earningsBreakdown(totalEstimate.gross, totalEstimate.commission)}
                </p>
              </div>
            </section>

            <section className="rounded-[20px] border border-border bg-surface px-4 py-2 shadow-card">
              <h2 className="text-[18px] font-medium text-text-primary">Pets</h2>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {client.pets.map((pet) => (
                  <div
                    key={pet.id}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-subtle py-1.5 px-3"
                  >
                    <span className="grid w-8 h-8 shrink-0 place-items-center rounded-xl bg-surface">
                      <PetIcon type={pet.type} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium leading-tight text-text-primary">{pet.name}</div>
                      <div className="text-[12px] leading-tight text-text-tertiary">{pet.type}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="rounded-[20px] border border-border bg-surface p-5 shadow-card">
                <h2 className="text-[18px] font-medium text-text-primary">Payment info</h2>
                <div className="mt-4 grid gap-3">
                  <InfoRow label="Method" value={<CategoryTag category={client.payment_method} />} />
                  <InfoRow label="Service type" value={serviceLabel(client)} />
                  <div className="rounded-2xl bg-subtle px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[13px] font-medium text-text-tertiary">Price per visit</span>
                      <div className="flex items-center gap-2">
                        <span className="text-right text-[15px] font-medium text-text-primary">{formatCurrency(currentPrice)}</span>
                        <button
                          className="focus-ring rounded-lg px-2 py-1 text-[12px] font-medium text-text-secondary transition hover:bg-surface hover:text-text-primary"
                          type="button"
                          onClick={() => openPriceModal()}
                        >
                          Change price
                        </button>
                      </div>
                    </div>
                    <button
                      className="mt-2 flex min-h-8 w-full items-center justify-between text-left text-[13px] font-medium text-text-secondary transition duration-150 ease-out hover:text-text-primary"
                      type="button"
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        suppressPriceHistoryClickUntilRef.current = Date.now() + 750;
                        togglePriceHistory();
                      }}
                      onClick={() => {
                        if (Date.now() < suppressPriceHistoryClickUntilRef.current) {
                          suppressPriceHistoryClickUntilRef.current = 0;
                          return;
                        }

                        togglePriceHistory();
                      }}
                    >
                      Price history
                      <ChevronRight className={cn("transition duration-200", priceHistoryOpen && "rotate-90")} size={15} strokeWidth={1.7} />
                    </button>
                    <div className="collapsible-grid" data-open={priceHistoryOpen}>
                      <div>
                        <div className="mt-2 space-y-2">
                          {orderedPriceHistory.length > 0 ? (
                            orderedPriceHistory.map((entry) => (
                              <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2">
                                <div>
                                  <div className="text-[14px] font-medium text-text-primary">{formatCurrency(entry.price)}</div>
                                  <div className="text-[12px] text-text-tertiary">Since {formatExactDate(entry.effective_date)}</div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    className="focus-ring rounded-lg px-2 py-1 text-[12px] font-medium text-text-secondary transition hover:bg-subtle hover:text-text-primary"
                                    type="button"
                                    onClick={() => openPriceModal(entry)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="focus-ring rounded-lg px-2 py-1 text-[12px] font-medium text-danger transition hover:bg-danger-soft"
                                    type="button"
                                    onClick={() => deletePriceHistory(entry)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-[13px] text-text-tertiary">No price history yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <InfoRow
                    label="Visits per week"
                    value={
                      <span style={{ fontWeight: 400 }}>
                        {selectedDays.length} {selectedDays.length === 1 ? "visit" : "visits"}/week
                      </span>
                    }
                  />
                  <InfoRow label="Visit days" value={selectedDays.length ? selectedDays.join(", ") : client.frequency_label || "Not set"} />
                </div>
              </div>
            </section>

            <div className="space-y-3 sm:hidden">
              {isAdmin && client.status === "Paused" ? (
                <Button className="w-full" variant="danger" onClick={deleteClient}>
                  <Trash2 size={17} strokeWidth={1.6} />
                  Delete
                </Button>
              ) : null}
              <Button className="w-full" variant="accent" onClick={() => setEditorOpen(true)}>
                <Edit3 size={17} strokeWidth={1.6} />
                Edit
              </Button>
            </div>
          </>
        ) : null}
      </div>

      {priceModalOpen && client ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-[#1A1916]/25 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) closePriceModal();
          }}
        >
          <div
            className="w-full max-w-[420px] rounded-[20px] border border-border bg-surface p-5 shadow-[0_20px_70px_rgba(48,38,24,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[22px] font-medium text-text-primary">{editingPrice ? "Edit price" : "Change price"}</h2>
                <p className="mt-1 text-[14px] text-text-secondary">Set the price and when it took effect.</p>
              </div>
              <Button className="min-h-10 px-3" variant="ghost" onClick={closePriceModal} aria-label="Close">
                <X size={18} strokeWidth={1.6} />
              </Button>
            </div>
            <div className="mt-5 grid gap-4">
              <label>
                <span className="text-[13px] font-medium text-text-secondary">Price per visit</span>
                <input
                  className="focus-ring mt-2 min-h-11 w-full rounded-xl border border-border bg-page px-3 text-[15px] text-text-primary"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={priceValue}
                  onChange={(event) => setPriceValue(event.target.value)}
                />
              </label>
              <div>
                <span className="text-[13px] font-medium text-text-secondary">Effective date</span>
                <DateCalendar
                  month={priceCalendarMonth}
                  mode={priceCalendarMode}
                  selectedDate={priceEffectiveDate}
                  onChangeMonth={changePriceCalendarMonth}
                  onToggleMode={togglePriceCalendarMode}
                  onSelectDate={selectPriceDate}
                  onSelectYear={selectPriceCalendarYear}
                  onSelectMonth={selectPriceCalendarMonth}
                />
              </div>
            </div>
            {error ? <p className="mt-3 text-[13px] text-danger">{error}</p> : null}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={closePriceModal} disabled={savingPrice}>
                Cancel
              </Button>
              <Button variant="accent" onClick={savePriceHistory} disabled={savingPrice || !priceValue || !priceEffectiveDate}>
                {savingPrice ? "Saving..." : editingPrice ? "Update price" : "Save price"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {statusModalOpen && client ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-[#1A1916]/25 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setStatusModalOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-[420px] rounded-[20px] border border-border bg-surface p-5 shadow-[0_20px_70px_rgba(48,38,24,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[22px] font-medium text-text-primary">Change status</h2>
                <p className="mt-1 text-[14px] text-text-secondary">
                  Confirm changing {client.name} to {nextStatus}.
                </p>
              </div>
              <Button
                className="min-h-10 px-3"
                variant="ghost"
                onClick={() => {
                  setStatusModalOpen(false);
                }}
                aria-label="Close"
              >
                <X size={18} strokeWidth={1.6} />
              </Button>
            </div>
            <div className="mt-5">
              <span className="text-[13px] font-medium text-text-secondary">From what date?</span>
              <div className="mt-2 rounded-2xl border border-border bg-page p-3">
                <div className="flex min-h-10 items-center justify-between gap-3">
                  <button
                    className="focus-ring inline-grid h-9 w-9 place-items-center rounded-xl text-text-tertiary transition hover:bg-subtle hover:text-text-primary"
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => changeCalendarMonth(event, -1)}
                    aria-label="Previous month"
                  >
                    <ChevronLeft size={17} strokeWidth={1.7} />
                  </button>
                  <button
                    className="focus-ring min-h-9 rounded-xl px-3 text-[15px] font-medium text-text-primary transition hover:bg-subtle"
                    type="button"
                    onClick={toggleStatusCalendarMode}
                  >
                    {monthTitle(statusCalendarMonth)}
                  </button>
                  <button
                    className="focus-ring inline-grid h-9 w-9 place-items-center rounded-xl text-text-tertiary transition hover:bg-subtle hover:text-text-primary"
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => changeCalendarMonth(event, 1)}
                    aria-label="Next month"
                  >
                    <ChevronRight size={17} strokeWidth={1.7} />
                  </button>
                </div>
                {statusCalendarMode === "days" ? (
                  <>
                    <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-text-tertiary">
                      {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                        <span key={`${day}-${index}`}>{day}</span>
                      ))}
                    </div>
                    <div className="mt-1 grid grid-cols-7 gap-1">
                      {calendarDays(statusCalendarMonth).map((date, index) =>
                        date ? (
                          <button
                            key={toInputDate(date)}
                            className={cn(
                              "focus-ring relative grid h-9 place-items-center rounded-xl text-[13px] font-medium transition",
                              statusDate === toInputDate(date)
                                ? "bg-accent text-text-primary shadow-sm"
                                : "text-text-secondary hover:bg-subtle hover:text-text-primary",
                              isFutureDate(date) && statusDate !== toInputDate(date) && "text-text-tertiary opacity-40 hover:opacity-70"
                            )}
                            type="button"
                            onClick={(event) => selectStatusDate(event, date)}
                          >
                            {date.getDate()}
                            {isToday(date) ? (
                              <span
                                className={cn(
                                  "absolute bottom-1 h-1 w-1 rounded-full",
                                  statusDate === toInputDate(date) ? "bg-text-primary" : "bg-accent"
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
                      {nearbyYears(statusCalendarMonth).map((year) => (
                        <button
                          key={year}
                          className={cn(
                            "focus-ring min-h-9 rounded-xl text-[13px] font-medium transition",
                            statusCalendarMonth.getFullYear() === year
                              ? "bg-accent text-text-primary shadow-sm"
                              : "text-text-secondary hover:bg-subtle hover:text-text-primary"
                          )}
                          type="button"
                          onClick={(event) => selectStatusCalendarYear(event, year)}
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
                            statusCalendarMonth.getMonth() === index
                              ? "bg-accent text-text-primary shadow-sm"
                              : "text-text-secondary hover:bg-subtle hover:text-text-primary"
                          )}
                          type="button"
                          onClick={(event) => selectStatusCalendarMonth(event, index)}
                        >
                          {month}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {error ? <p className="mt-3 text-[13px] text-danger">{error}</p> : null}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="ghost"
                onClick={() => {
                  setStatusModalOpen(false);
                }}
                disabled={savingStatus}
              >
                Cancel
              </Button>
              <Button variant="accent" onClick={changeStatus} disabled={savingStatus || !statusDate}>
                {savingStatus ? "Saving..." : `Change to ${nextStatus}`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {editorOpen && client ? (
        <div className="fixed inset-0 z-[60] bg-[#1A1916]/20 backdrop-blur-sm" onClick={() => setEditorOpen(false)}>
          <aside
            className="slide-over-panel ml-auto flex h-full w-full max-w-[620px] flex-col overflow-y-auto bg-page p-4 shadow-[0_20px_70px_rgba(48,38,24,0.18)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-text-primary">Edit client</h2>
                <p className="mt-1 text-[15px] text-text-secondary">Keep the details light, useful, and easy to scan.</p>
              </div>
              <Button variant="ghost" onClick={() => setEditorOpen(false)} aria-label="Close">
                <X size={20} strokeWidth={1.6} />
              </Button>
            </div>
            <ClientForm
              key={client.id}
              userId={user.id}
              client={client}
              hideStatusField
              statusHistory={timeline}
              onCancel={() => setEditorOpen(false)}
              onSaved={() => {
                setEditorOpen(false);
                loadClient();
              }}
            />
          </aside>
        </div>
      ) : null}
    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 rounded-2xl bg-subtle px-4">
      <span className="text-[13px] font-medium text-text-tertiary">{label}</span>
      <span className="text-right text-[15px] font-medium text-text-primary">{value}</span>
    </div>
  );
}

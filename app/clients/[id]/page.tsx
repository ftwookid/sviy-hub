"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Edit3, MapPin, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ClientForm } from "@/components/ClientForm";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { estimateClientEarnings, selectedDaysFromRecord, WEEKS_PER_MONTH } from "@/lib/clients";
import { formatCurrency, parseLocalDate, todayInputValue, toInputDate } from "@/lib/formatters";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { ClientPaymentMethod, ClientStatus, ClientWithPets, PriceHistory, StatusHistory } from "@/types/client";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ESTIMATED_TAX_RATE = 0.28;
const FINANCIAL_PERIODS = ["week", "month", "year"] as const;
const COMPACT_PRICE_HISTORY_COUNT = 5;

type FinancialPeriod = (typeof FINANCIAL_PERIODS)[number];
type PriceHistoryRow = PriceHistory & {
  isFallback?: boolean;
};

function dayBefore(dateValue: string) {
  const date = parseLocalDate(dateValue);
  date.setDate(date.getDate() - 1);
  return toInputDate(date);
}

function serviceLabel(client: ClientWithPets) {
  return client.service_type === "Custom" ? client.custom_service_type || "Custom" : client.service_type;
}

function petSummary(client: ClientWithPets) {
  return client.pets.map((pet) => `${pet.name || pet.type} · ${pet.type}`).join(", ") || "No pets listed";
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

function startingPriceEntry(client: ClientWithPets, effectiveDate: string): PriceHistoryRow {
  return {
    id: "starting-price",
    client_id: client.id,
    price: Number(client.price_per_visit),
    effective_date: effectiveDate,
    created_at: client.created_at,
    isFallback: true
  };
}

function seededPriceHistory(client: ClientWithPets | null, priceHistory: PriceHistory[], startDate: string) {
  if (!client) return [];
  const ascendingPrices = priceHistory.slice().sort((a, b) => a.effective_date.localeCompare(b.effective_date));

  if (ascendingPrices.length === 0 || ascendingPrices[0].effective_date > startDate) {
    return [startingPriceEntry(client, startDate), ...ascendingPrices];
  }

  return ascendingPrices;
}

function sortedPrices(priceHistory: PriceHistoryRow[]) {
  return priceHistory.slice().sort((a, b) => b.effective_date.localeCompare(a.effective_date));
}

function moneyToCents(value: number | string) {
  const normalized = String(value).replace(/[$,\s]/g, "");
  const numberValue = Number(normalized);
  if (!Number.isFinite(numberValue)) return Number.NaN;

  return Math.round((numberValue + Number.EPSILON) * 100);
}

function centsToMoney(cents: number) {
  return cents / 100;
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
  const suppressPriceHistoryClickUntilRef = useRef(0);
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
  const [savingStatus, setSavingStatus] = useState(false);
  const [financialPeriod, setFinancialPeriod] = useState<FinancialPeriod>("week");

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

  const nextStatus: ClientStatus = client?.status === "Active" ? "Paused" : "Active";
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
  const orderedPriceHistory = useMemo(
    () => sortedPrices(seededPriceHistory(client, priceHistory, currentStatusStartDate)),
    [client, currentStatusStartDate, priceHistory]
  );
  const visiblePriceHistory = priceHistoryOpen ? orderedPriceHistory : orderedPriceHistory.slice(0, COMPACT_PRICE_HISTORY_COUNT);
  const hasMorePriceHistory = orderedPriceHistory.length > COMPACT_PRICE_HISTORY_COUNT;
  const totalEstimate = useMemo(() => {
    if (!client) {
      return {
        gross: 0,
        commission: 0,
        net: 0
      };
    }

    const today = todayInputValue();
    const seededPrices = seededPriceHistory(client, priceHistory, currentStatusStartDate);

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

  function selectStatus(status: ClientStatus) {
    if (status === client?.status) return;
    openStatusModal();
  }

  function changeCalendarMonth(event: React.MouseEvent<HTMLButtonElement>, offset: number) {
    event.preventDefault();
    event.stopPropagation();
    setStatusCalendarMonth((current) => addMonths(current, offset));
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

  async function syncClientCurrentPrice(nextPriceHistory: PriceHistory[]) {
    if (!supabase || !client) return;
    const nextCurrentPrice = currentPriceFromHistory(client, nextPriceHistory);
    await supabase
      .from("clients")
      .update({ price_per_visit: centsToMoney(moneyToCents(nextCurrentPrice)), updated_at: new Date().toISOString() })
      .eq("id", client.id);
  }

  function openPriceModal(entry?: PriceHistoryRow, prefilledDate?: string) {
    const effectiveDate = entry?.effective_date ?? prefilledDate ?? todayInputValue();
    setEditingPrice(entry?.isFallback ? null : entry ?? null);
    setPriceValue(entry ? String(entry.price) : String(currentPrice || ""));
    setPriceEffectiveDate(effectiveDate);
    setPriceCalendarMonth(parseLocalDate(effectiveDate));
    setPriceCalendarMode("days");
    setPriceModalOpen(true);
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
    const nextPriceCents = moneyToCents(priceValue);
    if (!priceEffectiveDate || !Number.isFinite(nextPriceCents) || nextPriceCents < 0) {
      setError("Enter a valid price and effective date.");
      return;
    }

    setSavingPrice(true);
    setError("");

    const payload = {
      client_id: client.id,
      price: centsToMoney(nextPriceCents),
      effective_date: priceEffectiveDate
    };

    const sameDayEntry = priceHistory.find(
      (entry) => entry.effective_date === priceEffectiveDate && entry.id !== editingPrice?.id
    );

    const { error: priceError } = sameDayEntry
      ? await supabase.from("price_history").update(payload).eq("id", sameDayEntry.id)
      : editingPrice
        ? await supabase.from("price_history").update(payload).eq("id", editingPrice.id)
        : await supabase.from("price_history").insert(payload);

    if (priceError) {
      setError(priceError.message);
      setSavingPrice(false);
      return;
    }

    if (sameDayEntry && editingPrice && sameDayEntry.id !== editingPrice.id) {
      const { error: deleteMergedError } = await supabase.from("price_history").delete().eq("id", editingPrice.id);
      if (deleteMergedError) {
        setError(deleteMergedError.message);
        setSavingPrice(false);
        return;
      }
    }

    const nextHistory = sameDayEntry
      ? priceHistory
          .filter((entry) => entry.id !== editingPrice?.id)
          .map((entry) => (entry.id === sameDayEntry.id ? { ...entry, ...payload } : entry))
      : editingPrice
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

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      <div className="space-y-8">
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
            <header className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                  <h1 className="text-[38px] font-medium leading-[1.06] tracking-[-0.01em] text-text-primary">{client.name}</h1>
                  <div className="grid min-h-9 grid-cols-2 rounded-2xl border border-border bg-subtle p-1">
                    {(["Active", "Paused"] as ClientStatus[]).map((status) => (
                      <button
                        key={status}
                        className={cn(
                          "focus-ring min-w-16 rounded-xl px-2.5 text-[12px] font-medium transition duration-150 ease-out",
                          client.status === status
                            ? status === "Active"
                              ? "bg-success-soft text-success shadow-sm"
                              : "bg-surface text-text-secondary shadow-sm"
                            : "text-text-tertiary hover:bg-surface hover:text-text-secondary"
                        )}
                        type="button"
                        onClick={() => selectStatus(status)}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
                <Button className="min-h-10 shrink-0 px-3 text-[14px]" variant="ghost" onClick={() => setEditorOpen(true)}>
                  <Edit3 size={16} strokeWidth={1.6} />
                  Edit
                </Button>
              </div>
              <div className="grid w-full gap-3 rounded-[20px] bg-subtle p-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.8fr)]">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Pet</div>
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-text-primary">
                    <span className="text-[15px]" aria-hidden="true">🐾</span>
                    <span className="truncate text-[18px] font-medium leading-tight" title={petSummary(client)}>
                      {petSummary(client)}
                    </span>
                  </div>
                </div>
                <div className="min-w-0 md:border-l md:border-border md:pl-3">
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Details</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-text-tertiary">
                    <span>{serviceLabel(client)}</span>
                    <span>{selectedDays.length}x/week</span>
                    <span>{client.payment_method}</span>
                  </div>
                </div>
                <div className="min-w-0 md:border-l md:border-border md:pl-3">
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Address</div>
                  <div className="mt-1 flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[14px] leading-snug text-text-tertiary">
                    <MapPin className="shrink-0 text-text-tertiary/70" size={15} strokeWidth={1.6} />
                    {client.address ? (
                      <a className="min-w-0 overflow-visible transition hover:text-text-secondary" href={mapsUrl(client.address)} target="_blank" rel="noreferrer">
                        {displayAddress(client.address)}
                      </a>
                    ) : (
                      <span className="min-w-0">No address saved</span>
                    )}
                  </div>
                </div>
              </div>
            </header>

            <FinancialBlock
              period={financialPeriod}
              onPeriodChange={setFinancialPeriod}
              paymentMethod={client.payment_method}
              gross={estimate.monthlyGross}
              roverFee={estimate.commission}
              roverRate={Number(client.rover_commission_rate)}
              receive={estimate.monthlyNet}
              totalEarned={totalEstimate.net}
              sinceDate={currentStatusStartDate}
            />

            <section>
              <div className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[16px] font-semibold text-text-primary">Payment info</h2>
                  <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-text-tertiary">{client.payment_method}</span>
                </div>

                <div className="mt-3 rounded-2xl bg-subtle p-2.5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-surface px-3 py-2">
                      <div className="text-[11px] font-medium text-text-tertiary">Visits</div>
                      <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
                        <span className="text-[14px] font-semibold leading-5 text-text-primary">
                          {selectedDays.length} {selectedDays.length === 1 ? "visit" : "visits"}/week
                        </span>
                        <span className="truncate text-[11px] leading-4 text-text-tertiary">
                          {selectedDays.length ? selectedDays.join(", ") : client.frequency_label || "Not set"}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-surface px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] font-medium text-text-tertiary">Price per visit</div>
                        <button
                          className="focus-ring rounded-md px-1.5 py-0.5 text-[11px] font-medium text-amber-700 transition hover:bg-accent-soft hover:text-amber-800"
                          type="button"
                          onClick={() => openPriceModal()}
                        >
                          Change price
                        </button>
                      </div>
                      <div className="mt-0.5 text-[14px] font-semibold leading-5 text-text-primary">{formatCurrency(currentPrice)}</div>
                    </div>
                  </div>

                  <div className="mt-2 rounded-xl bg-surface px-3 py-2">
                    <div className="flex min-h-6 items-center justify-between gap-3">
                      <div className="text-[12px] font-medium text-text-secondary">Price history</div>
                      {hasMorePriceHistory ? (
                        <button
                          className="focus-ring inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-text-tertiary transition hover:bg-subtle hover:text-text-primary"
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
                          {priceHistoryOpen ? "Show less" : `Show all ${orderedPriceHistory.length}`}
                          <ChevronRight className={cn("transition duration-200", priceHistoryOpen && "rotate-90")} size={14} strokeWidth={1.7} />
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-1.5 space-y-1.5">
                      {visiblePriceHistory.length > 0 ? (
                        visiblePriceHistory.map((entry) => (
                          <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg bg-subtle px-2.5 py-1.5">
                            <div className="min-w-0">
                              <div className="text-[13px] font-medium leading-5 text-text-primary">{formatCurrency(entry.price)}</div>
                              <div className="truncate text-[11px] leading-4 text-text-tertiary">Since {formatExactDate(entry.effective_date)}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                className="focus-ring rounded-md px-1.5 py-0.5 text-[11px] font-medium text-text-secondary transition hover:bg-surface hover:text-text-primary"
                                type="button"
                                onClick={() => openPriceModal(entry)}
                              >
                                Edit
                              </button>
                              {!entry.isFallback ? (
                                <button
                                  className="focus-ring rounded-md px-1.5 py-0.5 text-[11px] font-medium text-danger transition hover:bg-danger-soft"
                                  type="button"
                                  onClick={() => deletePriceHistory(entry)}
                                >
                                  Delete
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-[13px] text-text-tertiary">No price history yet.</p>
                      )}
                    </div>
                    {!priceHistoryOpen && hasMorePriceHistory ? (
                      <p className="mt-2 text-[11px] text-text-tertiary">
                        Showing newest {COMPACT_PRICE_HISTORY_COUNT} of {orderedPriceHistory.length}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
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

function FinancialBlock({
  period,
  onPeriodChange,
  paymentMethod,
  gross,
  roverFee,
  roverRate,
  receive,
  totalEarned,
  sinceDate
}: {
  period: FinancialPeriod;
  onPeriodChange: (period: FinancialPeriod) => void;
  paymentMethod: ClientPaymentMethod;
  gross: number;
  roverFee: number;
  roverRate: number;
  receive: number;
  totalEarned: number;
  sinceDate: string;
}) {
  const periodFactor = period === "week" ? 1 / WEEKS_PER_MONTH : period === "year" ? 12 : 1;
  const periodLabel = period === "week" ? "week" : period === "year" ? "year" : "mo";
  const periodGross = gross * periodFactor;
  const periodRoverFee = roverFee * periodFactor;
  const periodReceive = receive * periodFactor;
  const tax = paymentMethod === "Cash" ? 0 : periodReceive * ESTIMATED_TAX_RATE;
  const takeHome = periodReceive - tax;
  const roverPercent = Math.round(roverRate * 100);
  const hasPlatformFee = paymentMethod === "Rover";
  const isTaxable = paymentMethod !== "Cash";

  return (
    <section>
      <div className="rounded-[20px] border border-border bg-surface p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-text-primary">Financial overview</h2>
          <div className="flex justify-end">
            <div className="grid h-7 grid-cols-3 rounded-lg border border-border bg-subtle p-0.5">
              {FINANCIAL_PERIODS.map((item) => (
                <button
                  key={item}
                  className={cn(
                    "focus-ring min-w-14 rounded-md px-2 text-[10px] font-medium leading-none transition duration-150 ease-out",
                    period === item ? "bg-surface text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-secondary"
                  )}
                  type="button"
                  onClick={() => onPeriodChange(item)}
                >
                  /{item === "month" ? "mo" : item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 divide-y divide-border rounded-xl bg-subtle px-3">
          <div className="py-2">
            <BreakdownRow label={`Gross/${periodLabel}`} value={formatCurrency(periodGross)} />
            {hasPlatformFee ? (
              <div className="mt-1">
                <BreakdownRow label="- Platform fee" value={`- ${formatCurrency(periodRoverFee)}`} muted />
                <FinancialHelper>Rover fee · {roverPercent}% of gross</FinancialHelper>
              </div>
            ) : null}
          </div>

          <div className="py-2">
            <BreakdownRow
              label={`You receive/${periodLabel}`}
              value={formatCurrency(periodReceive)}
              emphasized
            />
          </div>

          <div className="py-2">
            {isTaxable ? <BreakdownRow label="- Est. tax (28%)" value={`- ${formatCurrency(tax)}`} muted /> : null}
            <div className={isTaxable ? "mt-1" : undefined}>
              <BreakdownRow label={`Est. take-home/${periodLabel}`} value={formatCurrency(takeHome)} />
            </div>
            {!isTaxable ? <FinancialHelper>Cash · not taxable</FinancialHelper> : null}
          </div>
        </div>

        <div className="mt-3 space-y-1">
          <FinancialHelper>
            Total earned {formatCurrency(totalEarned)} · since {formatExactDate(sinceDate)}
          </FinancialHelper>
          {isTaxable ? <FinancialHelper>Est. tax ~28% effective rate · updates at tax time</FinancialHelper> : null}
        </div>
      </div>
    </section>
  );
}

function FinancialHelper({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 text-[10px] font-normal leading-4 text-text-tertiary">{children}</p>;
}

function BreakdownRow({
  label,
  value,
  muted = false,
  emphasized = false
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasized?: boolean;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-4">
      <span className="text-[11px] font-medium leading-5 text-text-secondary">
        {label}
      </span>
      <span
        className={cn(
          "text-right text-[13px] font-semibold leading-5 tabular-nums text-text-primary",
          muted && "font-normal text-text-tertiary",
          emphasized && "text-[20px] font-bold text-amber-700"
        )}
      >
        {value}
      </span>
    </div>
  );
}

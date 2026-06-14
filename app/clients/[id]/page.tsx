"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bird, CalendarDays, Cat, Check, Dog, Edit3, MapPin, Pause, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CategoryTag } from "@/components/CategoryTag";
import { ClientForm } from "@/components/ClientForm";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { estimateClientFromRecord, selectedDaysFromRecord } from "@/lib/clients";
import { formatCurrency, parseLocalDate, todayInputValue, toInputDate } from "@/lib/formatters";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { ClientStatus, ClientWithPets, PetType, StatusHistory } from "@/types/client";

const petIcons = {
  Dog,
  Cat,
  Bird,
  Exotic: Sparkles
};

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

function earningDaysSince(dateValue: string) {
  const start = parseLocalDate(dateValue);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.floor((startOfToday.getTime() - start.getTime()) / 86_400_000) + 1);
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

export default function ClientDetailPage() {
  const sinceDateInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const { user, isAdmin, authLoading } = useAuthUser();
  const [client, setClient] = useState<ClientWithPets | null>(null);
  const [history, setHistory] = useState<StatusHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusDate, setStatusDate] = useState(todayInputValue());
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingSinceDate, setSavingSinceDate] = useState(false);

  const loadClient = useCallback(async () => {
    if (!supabase || !user || !clientId) return;
    setLoading(true);
    setError("");

    let clientQuery = supabase.from("clients").select("*, pets(*)").eq("id", clientId);
    if (!isAdmin) clientQuery = clientQuery.eq("user_id", user.id);

    const [{ data: clientData, error: clientError }, { data: historyData, error: historyError }] = await Promise.all([
      clientQuery.single(),
      supabase.from("status_history").select("*").eq("client_id", clientId).order("start_date", { ascending: false })
    ]);

    if (clientError) {
      setError(clientError.message);
      setClient(null);
      setHistory([]);
    } else {
      const nextClient = clientData as ClientWithPets & { pets: ClientWithPets["pets"] | null };
      setClient({ ...nextClient, pets: nextClient.pets ?? [] });
      setHistory((historyData ?? []) as StatusHistory[]);
      if (historyError) setError(historyError.message);
    }

    setLoading(false);
  }, [clientId, isAdmin, user]);

  useEffect(() => {
    loadClient();
  }, [loadClient]);

  const nextStatus: ClientStatus = client?.status === "Active" ? "Paused" : "Active";
  const estimate = client ? estimateClientFromRecord(client) : null;
  const currentStatusHistory = currentHistory(client, history);
  const currentStatusStartDate = statusStartDate(client, history);
  const selectedDays = client ? selectedDaysFromRecord(client.frequency_label, client.visits_per_week) : [];
  const totalEstimate = useMemo(() => {
    if (!client) {
      return {
        gross: 0,
        commission: 0,
        net: 0
      };
    }

    const days = earningDaysSince(currentStatusStartDate);
    const weeks = days / 7;
    const gross = Number(client.price_per_visit) * selectedDays.length * weeks;
    const commission = client.payment_method === "Rover" ? gross * Number(client.rover_commission_rate) : 0;
    return {
      gross,
      commission,
      net: gross - commission
    };
  }, [client, currentStatusStartDate, selectedDays.length]);

  const timeline = useMemo(() => history.slice().sort((a, b) => b.start_date.localeCompare(a.start_date)), [history]);

  function openStatusModal() {
    setStatusDate(todayInputValue());
    setStatusModalOpen(true);
  }

  function openSinceDatePicker() {
    const input = sinceDateInputRef.current;
    if (!input) return;

    if (typeof input.showPicker === "function") {
      input.showPicker();
    } else {
      input.click();
    }
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
                <div className="mt-4">
                  <span className="text-[13px] font-medium text-text-tertiary">Since</span>
                  <span className="relative mt-2 flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-border bg-page px-3 text-[14px] font-medium text-text-primary">
                    <span>{formatExactDate(currentStatusStartDate)}</span>
                    <button
                      className="focus-ring inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-tertiary transition hover:bg-subtle hover:text-text-primary"
                      type="button"
                      onClick={openSinceDatePicker}
                      disabled={savingSinceDate}
                      aria-label="Edit status start date"
                    >
                      <Edit3 size={14} strokeWidth={1.7} />
                    </button>
                    <input
                      ref={sinceDateInputRef}
                      className="pointer-events-none absolute bottom-2 right-3 h-1 w-1 opacity-0"
                      type="date"
                      tabIndex={-1}
                      value={currentStatusStartDate}
                      disabled={savingSinceDate}
                      onChange={(event) => updateSinceDate(event.target.value)}
                      aria-hidden="true"
                    />
                  </span>
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
                  <InfoRow label="Price per visit" value={formatCurrency(client.price_per_visit)} />
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

      {statusModalOpen && client ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[#1A1916]/25 p-4 backdrop-blur-sm" onClick={() => setStatusModalOpen(false)}>
          <div
            className="w-full max-w-[420px] rounded-[20px] border border-border bg-surface p-5 shadow-[0_20px_70px_rgba(48,38,24,0.18)]"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[22px] font-medium text-text-primary">Change status</h2>
                <p className="mt-1 text-[14px] text-text-secondary">
                  Confirm changing {client.name} to {nextStatus}.
                </p>
              </div>
              <Button className="min-h-10 px-3" variant="ghost" onClick={() => setStatusModalOpen(false)} aria-label="Close">
                <X size={18} strokeWidth={1.6} />
              </Button>
            </div>
            <label className="mt-5 block">
              <span className="text-[13px] font-medium text-text-secondary">From what date?</span>
              <input
                className="focus-ring mt-2 min-h-11 w-full rounded-xl border border-border bg-page px-3 text-[15px] text-text-primary"
                type="date"
                value={statusDate}
                onChange={(event) => setStatusDate(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              />
            </label>
            {error ? <p className="mt-3 text-[13px] text-danger">{error}</p> : null}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setStatusModalOpen(false)} disabled={savingStatus}>
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
            className="ml-auto flex h-full w-full max-w-[620px] flex-col overflow-y-auto bg-page p-4 shadow-[0_20px_70px_rgba(48,38,24,0.18)] sm:p-6"
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

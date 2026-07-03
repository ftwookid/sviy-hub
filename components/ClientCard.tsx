"use client";

import { Clock, Home, PawPrint, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCurrency, todayInputValue } from "@/lib/formatters";
import { estimateClientFromRecord } from "@/lib/clients";
import type { ClientPaymentMethod, ClientWithPets } from "@/types/client";

function petNames(client: ClientWithPets) {
  return client.pets.map((pet) => pet.name || pet.type).join(", ") || "No pets listed";
}

function serviceLabel(client: ClientWithPets) {
  return client.service_type === "Custom" ? client.custom_service_type || "Custom service" : client.service_type;
}

function ServiceIcon({ service }: { service: string }) {
  const normalized = service.toLowerCase();
  const Icon = normalized.includes("house")
    ? Home
    : normalized.includes("drop")
      ? Clock
      : normalized.includes("exotic")
        ? Sparkles
        : PawPrint;

  return <Icon size={14} strokeWidth={1.6} className="shrink-0 text-text-tertiary" />;
}

function PaymentMethodIcon({ method }: { method: ClientPaymentMethod }) {
  if (method === "Venmo") {
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[6px] bg-[#008CFF]" aria-hidden="true">
        <span className="text-[13px] font-black italic leading-none text-white">V</span>
      </span>
    );
  }

  if (method === "Cash") {
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[6px] bg-[#2F8A57]" aria-hidden="true">
        <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 2.6v14.8M13.8 6.1C13.1 5.1 11.9 4.5 10 4.5c-2.1 0-3.4.9-3.4 2.3 0 1.6 1.6 2.1 3.4 2.5 2 .4 3.7.9 3.7 2.6 0 1.5-1.4 2.6-3.7 2.6-1.9 0-3.3-.6-4.1-1.8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[6px] bg-[#00A86B]" aria-hidden="true">
      <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
        <circle cx="5.8" cy="9" r="1.8" fill="currentColor" />
        <circle cx="9.2" cy="6.8" r="1.8" fill="currentColor" />
        <circle cx="12.8" cy="7.5" r="1.8" fill="currentColor" />
        <path
          d="M4.6 14.2c.6-2.1 2.4-3.7 4.5-3.7 2.3 0 3.8 1.8 3.8 4 0 1.5-.9 2.4-2.2 2.4-.7 0-1.2-.3-1.7-.7-.5.4-1 .7-1.7.7-1.8 0-3.2-.8-2.7-2.7Z"
          fill="currentColor"
        />
        <path
          d="M14.6 17.2V6.5h3.1c2.2 0 3.5 1.1 3.5 2.8 0 1.5-1.1 2.6-2.8 2.8l3 5.1M14.6 12h3.4"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function paymentMethodTone(method: ClientPaymentMethod) {
  if (method === "Rover") return "bg-[#E8F7F0] text-[#247A55]";
  if (method === "Cash") return "bg-green-100 text-green-700";
  return "bg-blue-100 text-blue-700";
}

function currentPrice(client: ClientWithPets) {
  const today = todayInputValue();
  const currentEntry = (client.price_history ?? [])
    .filter((entry) => entry.effective_date <= today)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];

  return Number(currentEntry?.price ?? client.price_per_visit);
}

export function ClientCard({
  client,
  ownerLabel,
  onDelete,
  onClick
}: {
  client: ClientWithPets;
  ownerLabel?: string;
  onDelete?: () => void;
  onClick: () => void;
}) {
  const estimate = estimateClientFromRecord({ ...client, price_per_visit: currentPrice(client) });
  const isPaused = client.status === "Paused";
  const pets = petNames(client);
  const service = serviceLabel(client);

  return (
    <button
      className={cn(
        "group w-full rounded-[20px] border p-5 text-left transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(80,66,44,0.13)]",
        isPaused
          ? "border-border bg-subtle/70 opacity-70 shadow-none hover:border-border-emphasis hover:opacity-85"
          : "border-border bg-surface shadow-card hover:border-border-emphasis"
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-[22px] font-medium leading-[1.16] text-text-primary" title={pets}>
            {pets}
          </div>
          <div className="mt-1 truncate text-[14px] font-medium text-text-tertiary" title={client.name}>
            {client.name}
          </div>
          <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[12px] text-text-tertiary" title={service}>
            <ServiceIcon service={service} />
            <span className="truncate">{service}</span>
          </div>
          {ownerLabel ? (
            <div className="mt-2 truncate text-[11px] font-medium text-text-tertiary" title={ownerLabel}>
              {ownerLabel}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <span className={cn("inline-flex min-h-7 items-center gap-1.5 rounded-full px-2 py-1 pr-2.5 text-[11px] font-medium", paymentMethodTone(client.payment_method))}>
            <PaymentMethodIcon method={client.payment_method} />
            {client.payment_method}
          </span>
          {onDelete ? (
            <span
              className="focus-ring inline-grid h-8 w-8 place-items-center rounded-xl text-text-tertiary transition hover:bg-danger-soft hover:text-danger"
              role="button"
              tabIndex={0}
              aria-label={`Delete ${client.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onDelete();
                }
              }}
            >
              <Trash2 size={15} strokeWidth={1.7} />
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex items-end justify-end gap-3">
        <div className="flex items-baseline gap-1.5 text-text-primary">
          <span className="text-[22px] font-medium leading-none">{formatCurrency(estimate.monthlyNet)}</span>
          <span className="text-[13px] font-medium text-text-tertiary">/mo</span>
        </div>
      </div>
    </button>
  );
}

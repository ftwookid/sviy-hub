"use client";

import { Clock, Home, PawPrint, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
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

function paymentMethodTone(method: ClientPaymentMethod) {
  if (method === "Rover") return "bg-amber-100 text-amber-700";
  if (method === "Cash") return "bg-green-100 text-green-700";
  return "bg-blue-100 text-blue-700";
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
  const estimate = estimateClientFromRecord(client);
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
          <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium", paymentMethodTone(client.payment_method))}>
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

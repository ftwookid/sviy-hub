"use client";

import { Clock, Home, PawPrint, Sparkles, Trash2 } from "lucide-react";
import { ClientPaymentBadge } from "@/components/ClientPaymentBadge";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import { estimateClientCurrentEarnings, WEEKS_PER_MONTH } from "@/lib/clients";
import type { ClientWithPets } from "@/types/client";

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
  const estimate = estimateClientCurrentEarnings(client);
  const weeklyNet = estimate.monthlyNet / WEEKS_PER_MONTH;
  const annualNet = estimate.monthlyNet * 12;
  const isPaused = client.status === "Paused";
  const pets = petNames(client);
  const service = serviceLabel(client);

  return (
    <button
      className={cn(
        "group w-full rounded-[18px] border p-4 text-left transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(80,66,44,0.13)]",
        isPaused
          ? "border-border bg-subtle/70 opacity-70 shadow-none hover:border-border-emphasis hover:opacity-85"
          : "border-border bg-surface shadow-card hover:border-border-emphasis"
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[20px] font-medium leading-[1.15] text-text-primary" title={pets}>
            {pets}
          </div>
          <div className="mt-0.5 truncate text-[13px] font-medium text-text-tertiary" title={client.name}>
            {client.name}
          </div>
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12px] text-text-tertiary" title={service}>
            <ServiceIcon service={service} />
            <span className="truncate">{service}</span>
          </div>
          {ownerLabel ? (
            <div className="mt-1.5 truncate text-[11px] font-medium text-text-tertiary" title={ownerLabel}>
              {ownerLabel}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-3">
          <div className="flex items-start gap-2">
            <ClientPaymentBadge className="min-h-6 px-1.5 py-0.5 pr-2 text-[10px]" method={client.payment_method} />
            {onDelete ? (
              <span
                className="focus-ring inline-grid h-7 w-7 place-items-center rounded-xl text-text-tertiary transition hover:bg-danger-soft hover:text-danger"
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
          <div className="flex flex-col items-end gap-1.5">
            <div className="text-right">
              <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Weekly income</div>
              <div className="mt-0.5 flex items-baseline justify-end gap-1.5 text-text-primary">
                <span className="text-[22px] font-medium leading-none">{formatCurrency(weeklyNet)}</span>
                <span className="text-[13px] font-medium text-text-tertiary">/wk</span>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-x-2.5 gap-y-1 text-[11px] font-medium text-text-tertiary">
              <span>{formatCurrency(estimate.monthlyNet)} /mo</span>
              <span>{formatCurrency(annualNet)} /yr</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

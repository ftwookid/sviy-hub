"use client";

import { Bird, Cat, Dog, Sparkles, Trash2 } from "lucide-react";
import { CategoryTag } from "@/components/CategoryTag";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/formatters";
import { estimateClientFromRecord } from "@/lib/clients";
import type { ClientWithPets, PetType } from "@/types/client";

const petIcons = {
  Dog,
  Cat,
  Bird,
  Exotic: Sparkles
};

export function PetTypeIcon({ type }: { type: PetType }) {
  const Icon = petIcons[type];
  return <Icon size={14} strokeWidth={1.6} className="text-text-tertiary" />;
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
          <div className="truncate text-[20px] font-medium leading-[1.2] text-text-primary">{client.name}</div>
          {ownerLabel ? (
            <div className="mt-1 truncate text-[12px] font-medium text-text-tertiary">Owner: {ownerLabel}</div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {client.pets.map((pet) => (
              <span
                key={pet.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-[12px] font-medium text-text-secondary"
              >
                <PetTypeIcon type={pet.type} />
                {pet.name || pet.type}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CategoryTag category={client.payment_method} />
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

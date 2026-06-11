"use client";

import { Bird, Cat, Dog, Sparkles } from "lucide-react";
import { CategoryTag } from "@/components/CategoryTag";
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

export function ClientCard({ client, onClick }: { client: ClientWithPets; onClick: () => void }) {
  const estimate = estimateClientFromRecord(client);

  return (
    <button
      className="group w-full rounded-[20px] border border-border bg-surface p-5 text-left shadow-card transition duration-200 ease-in-out hover:-translate-y-0.5 hover:border-border-emphasis active:scale-[0.99]"
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-[20px] font-medium leading-[1.2] text-text-primary">{client.name}</div>
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
        <CategoryTag category={client.payment_method} />
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="text-[13px] text-text-tertiary">
          {client.status === "Paused" ? "Paused" : "Estimated monthly"}
        </div>
        <div className="text-[22px] font-medium leading-none text-text-primary">
          {formatCurrency(estimate.monthlyNet)}
        </div>
      </div>
    </button>
  );
}

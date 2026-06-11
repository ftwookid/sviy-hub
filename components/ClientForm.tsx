"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { Camera, ChevronDown, Minus, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input, Select, Textarea } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import {
  CLIENT_PAYMENT_METHODS,
  FREQUENCY_SUGGESTIONS,
  PET_TYPES,
  ROVER_COMMISSION_RATE,
  SERVICE_TYPES,
  defaultClientValues,
  estimateClientEarnings,
  parseVisitsPerWeek
} from "@/lib/clients";
import { formatCurrency, sanitizeFilename } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
import type {
  ClientFormPet,
  ClientFormValues,
  ClientPaymentMethod,
  ClientStatus,
  ClientWithPets,
  PetType
} from "@/types/client";

type ClientFormProps = {
  userId: string;
  client?: ClientWithPets | null;
  onSaved: () => void;
  onCancel: () => void;
};

type ClientFormErrors = Partial<Record<"name" | "address" | "price_per_visit" | "pets", string>>;

function valuesFromClient(client?: ClientWithPets | null): ClientFormValues {
  if (!client) return defaultClientValues();
  return {
    name: client.name,
    address: client.address,
    pets:
      client.pets.length > 0
        ? client.pets.map((pet) => ({
            id: pet.id,
            name: pet.name,
            type: pet.type,
            photo_url: pet.photo_url,
            photo_filename: pet.photo_filename,
            photoFile: null
          }))
        : [{ name: "", type: "Dog", photoFile: null }],
    payment_method: client.payment_method,
    status: client.status,
    service_type: client.service_type,
    custom_service_type: client.custom_service_type ?? "",
    price_per_visit: String(client.price_per_visit),
    frequency_label: client.frequency_label,
    visits_per_week: client.visits_per_week == null ? "" : String(client.visits_per_week),
    notes: client.notes ?? ""
  };
}

export function ClientForm({ userId, client, onSaved, onCancel }: ClientFormProps) {
  const [values, setValues] = useState<ClientFormValues>(() => valuesFromClient(client));
  const [errors, setErrors] = useState<ClientFormErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notesOpen, setNotesOpen] = useState(Boolean(client?.notes));

  const calculatedVisitsPerWeek = useMemo(() => {
    const explicit = Number(values.visits_per_week);
    if (values.visits_per_week !== "" && Number.isFinite(explicit)) return explicit;
    return parseVisitsPerWeek(values.frequency_label);
  }, [values.frequency_label, values.visits_per_week]);

  const estimate = estimateClientEarnings({
    pricePerVisit: Number(values.price_per_visit || 0),
    visitsPerWeek: calculatedVisitsPerWeek,
    paymentMethod: values.payment_method,
    commissionRate: ROVER_COMMISSION_RATE
  });

  useEffect(() => {
    const parsed = parseVisitsPerWeek(values.frequency_label);
    if (parsed != null && values.visits_per_week !== String(parsed)) {
      setValues((current) => ({ ...current, visits_per_week: String(parsed) }));
    }
  }, [values.frequency_label, values.visits_per_week]);

  function update<K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function updatePet(index: number, patch: Partial<ClientFormPet>) {
    setValues((current) => ({
      ...current,
      pets: current.pets.map((pet, petIndex) => (petIndex === index ? { ...pet, ...patch } : pet))
    }));
    setErrors((current) => ({ ...current, pets: undefined }));
  }

  function addPet() {
    setValues((current) => ({
      ...current,
      pets: [...current.pets, { name: "", type: "Dog", photoFile: null }]
    }));
  }

  function removePet(index: number) {
    setValues((current) => ({
      ...current,
      pets: current.pets.length === 1 ? current.pets : current.pets.filter((_, petIndex) => petIndex !== index)
    }));
  }

  function selectPhoto(index: number, event: ChangeEvent<HTMLInputElement>) {
    updatePet(index, { photoFile: event.target.files?.[0] ?? null });
  }

  function validate() {
    const nextErrors: ClientFormErrors = {};
    if (!values.name.trim()) nextErrors.name = "Client name is required.";
    if (!values.address.trim()) nextErrors.address = "Address is required.";
    if (!values.price_per_visit || Number(values.price_per_visit) < 0) {
      nextErrors.price_per_visit = "Enter a visit price.";
    }
    if (values.pets.some((pet) => !pet.name.trim())) nextErrors.pets = "Each pet needs a name.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function uploadPetPhoto(pet: ClientFormPet) {
    if (!pet.photoFile || !supabase) {
      return {
        photo_url: pet.photo_url ?? null,
        photo_filename: pet.photo_filename ?? null
      };
    }

    const filename = `${Date.now()}-${sanitizeFilename(pet.photoFile.name)}`;
    const path = `${userId}/pets/${filename}`;
    const { error } = await supabase.storage.from("pet-photos").upload(path, pet.photoFile, {
      upsert: false
    });

    if (error) throw error;

    return {
      photo_url: path,
      photo_filename: pet.photoFile.name
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate() || !supabase) return;

    setSaving(true);
    setFormError("");
    try {
      const payload = {
        user_id: userId,
        name: values.name.trim(),
        address: values.address.trim(),
        payment_method: values.payment_method,
        status: values.status,
        service_type: values.service_type,
        custom_service_type: values.service_type === "Custom" ? values.custom_service_type.trim() || null : null,
        price_per_visit: Number(Number(values.price_per_visit || 0).toFixed(2)),
        frequency_label: values.frequency_label.trim(),
        visits_per_week: calculatedVisitsPerWeek,
        notes: values.notes.trim() || null,
        rover_commission_rate: ROVER_COMMISSION_RATE,
        updated_at: new Date().toISOString()
      };

      const clientQuery = client
        ? supabase.from("clients").update(payload).eq("id", client.id).select("id").single()
        : supabase.from("clients").insert(payload).select("id").single();

      const { data: savedClient, error: clientError } = await clientQuery;
      if (clientError) throw clientError;

      const clientId = savedClient.id as string;
      if (client) {
        const { error: deleteError } = await supabase.from("pets").delete().eq("client_id", clientId);
        if (deleteError) throw deleteError;
      }

      const petsPayload = await Promise.all(
        values.pets.map(async (pet) => ({
          user_id: userId,
          client_id: clientId,
          name: pet.name.trim(),
          type: pet.type,
          ...(await uploadPetPhoto(pet))
        }))
      );

      const { error: petsError } = await supabase.from("pets").insert(petsPayload);
      if (petsError) throw petsError;

      onSaved();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong while saving.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Name"
          value={values.name}
          error={errors.name}
          placeholder="Maya"
          onChange={(event) => update("name", event.target.value)}
        />
        <Input
          label="Address"
          value={values.address}
          error={errors.address}
          placeholder="123 Garden Lane"
          onChange={(event) => update("address", event.target.value)}
        />
      </div>

      <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-[17px] font-medium text-text-primary">Pets</h3>
            {errors.pets ? <p className="mt-1 text-[12px] text-danger">{errors.pets}</p> : null}
          </div>
          <Button variant="soft" type="button" onClick={addPet}>
            <Plus size={17} strokeWidth={1.6} />
            Add pet
          </Button>
        </div>

        <div className="space-y-3">
          {values.pets.map((pet, index) => (
            <div key={pet.id ?? index} className="rounded-2xl bg-subtle p-3 transition duration-200 ease-in-out">
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
                  disabled={values.pets.length === 1}
                  aria-label="Remove pet"
                >
                  <Minus size={18} strokeWidth={1.6} />
                </Button>
              </div>
              <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3 text-[14px] font-medium text-text-secondary transition hover:bg-[#FBFAF7] active:scale-[0.99]">
                <Camera size={16} strokeWidth={1.6} />
                {pet.photoFile?.name ?? pet.photo_filename ?? "Add pet photo"}
                <input className="sr-only" type="file" accept="image/*" onChange={(event) => selectPhoto(index, event)} />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell label="Payment method">
            <div className="grid min-h-11 grid-cols-3 rounded-2xl border border-border bg-subtle p-1">
              {CLIENT_PAYMENT_METHODS.map((method) => (
                <button
                  key={method}
                  className={cn(
                    "rounded-xl text-[14px] font-medium transition duration-200 ease-in-out active:scale-[0.98]",
                    values.payment_method === method ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary"
                  )}
                  onClick={() => update("payment_method", method)}
                  type="button"
                >
                  {method}
                </button>
              ))}
            </div>
          </FieldShell>

          <FieldShell label="Status">
            <div className="grid min-h-11 grid-cols-2 rounded-2xl border border-border bg-subtle p-1">
              {(["Active", "Paused"] as ClientStatus[]).map((status) => (
                <button
                  key={status}
                  className={cn(
                    "rounded-xl text-[14px] font-medium transition duration-200 ease-in-out active:scale-[0.98]",
                    values.status === status
                      ? status === "Active"
                        ? "bg-success-soft text-success shadow-sm"
                        : "bg-surface text-text-secondary shadow-sm"
                      : "text-text-tertiary"
                  )}
                  onClick={() => update("status", status)}
                  type="button"
                >
                  {status}
                </button>
              ))}
            </div>
          </FieldShell>

          <Select
            label="Service"
            value={values.service_type}
            onChange={(event) => update("service_type", event.target.value)}
          >
            {SERVICE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>

          {values.service_type === "Custom" ? (
            <Input
              label="Custom service"
              value={values.custom_service_type}
              placeholder="Puppy socialization"
              onChange={(event) => update("custom_service_type", event.target.value)}
            />
          ) : (
            <Input
              label="Price per visit"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={values.price_per_visit}
              error={errors.price_per_visit}
              placeholder="30.00"
              onChange={(event) => update("price_per_visit", event.target.value)}
            />
          )}

          {values.service_type === "Custom" ? (
            <Input
              label="Price per visit"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={values.price_per_visit}
              error={errors.price_per_visit}
              placeholder="30.00"
              onChange={(event) => update("price_per_visit", event.target.value)}
            />
          ) : null}

          <div className="sm:col-span-2">
            <Input
              label="Frequency"
              value={values.frequency_label}
              placeholder="daily"
              onChange={(event) => update("frequency_label", event.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {FREQUENCY_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.label}
                  className="min-h-8 rounded-full bg-accent-soft px-3 text-[12px] font-medium text-text-secondary transition hover:bg-[#E7DABF] active:scale-[0.98]"
                  type="button"
                  onClick={() => {
                    update("frequency_label", suggestion.label);
                    update("visits_per_week", String(suggestion.visitsPerWeek));
                  }}
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-border bg-[#FFFEFB] p-4 shadow-card">
        <div className="flex items-center gap-2 text-[15px] font-medium text-text-primary">
          <Sparkles size={17} strokeWidth={1.6} className="text-accent" />
          Earnings estimate
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Metric label="Weekly" value={formatCurrency(estimate.weeklyGross)} />
          <Metric label="Monthly gross" value={formatCurrency(estimate.monthlyGross)} />
          <Metric label={values.payment_method === "Rover" ? "After Rover fee" : "Monthly net"} value={formatCurrency(estimate.monthlyNet)} />
          <Metric label="Taxable" value={estimate.taxable ? "Yes" : "No"} />
        </div>
        {values.payment_method === "Rover" ? (
          <p className="mt-3 text-[13px] text-text-secondary">
            Rover commission is set to {Math.round(ROVER_COMMISSION_RATE * 100)}% and can be changed in code later.
          </p>
        ) : null}
      </section>

      <button
        className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-border bg-surface px-4 text-left text-[15px] font-medium text-text-secondary transition hover:bg-subtle"
        type="button"
        onClick={() => setNotesOpen((open) => !open)}
      >
        Notes
        <ChevronDown className={cn("transition duration-200", notesOpen && "rotate-180")} size={18} strokeWidth={1.6} />
      </button>
      {notesOpen ? (
        <Textarea
          label="Private notes"
          value={values.notes}
          placeholder="Pet quirks, routines, access notes..."
          onChange={(event) => update("notes", event.target.value)}
        />
      ) : null}

      {formError ? <p className="text-[13px] text-danger">{formError}</p> : null}

      <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-border bg-page/90 px-4 py-4 backdrop-blur-xl sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button className="w-full" variant="accent" type="submit" disabled={saving}>
          {saving ? "Saving..." : client ? "Save client" : "Add client"}
        </Button>
        <Button variant="soft" type="button" onClick={onCancel} aria-label="Cancel">
          <X size={18} strokeWidth={1.6} />
        </Button>
      </div>
    </form>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-subtle p-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">{label}</div>
      <div className="mt-1 text-[16px] font-medium text-text-primary">{value}</div>
    </div>
  );
}

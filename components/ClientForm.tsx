"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Camera, ChevronDown, Minus, Plus, Sparkles, X } from "lucide-react";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input, Select, Textarea } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import {
  CLIENT_PAYMENT_METHODS,
  PET_TYPES,
  ROVER_COMMISSION_RATE,
  SERVICE_TYPES,
  WEEK_DAYS,
  defaultClientValues,
  estimateClientEarnings,
  selectedDaysFromRecord,
  selectedDaysLabel
} from "@/lib/clients";
import { formatCurrency, formatShortDate, sanitizeFilename } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
import type {
  ClientFormPet,
  ClientFormValues,
  ClientPaymentMethod,
  ClientStatus,
  ClientWithPets,
  PetType,
  StatusHistory
} from "@/types/client";

type ClientFormProps = {
  userId: string;
  client?: ClientWithPets | null;
  hideStatusField?: boolean;
  statusHistory?: StatusHistory[];
  onSaved: () => void;
  onCancel: () => void;
};

type ClientFormErrors = Partial<
  Record<"name" | "address" | "payment_method" | "price_per_visit" | "pets" | "selected_days", string>
>;

type ChangeSummary = {
  label: string;
  before: string;
  after: string;
};

const MAX_PET_PHOTO_SIZE = 800;
const MAX_PET_PHOTO_BYTES = 200 * 1024;
const HEIC_CONTENT_TYPE = "image/heic";

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
        : [],
    payment_method: client.payment_method,
    status: client.status,
    service_type: client.service_type,
    custom_service_type: client.custom_service_type ?? "",
    price_per_visit: String(client.price_per_visit),
    selected_days: selectedDaysFromRecord(client.frequency_label, client.visits_per_week),
    notes: client.notes ?? ""
  };
}

export function ClientForm({ userId, client, hideStatusField = false, statusHistory = [], onSaved, onCancel }: ClientFormProps) {
  const [values, setValues] = useState<ClientFormValues>(() => valuesFromClient(client));
  const [errors, setErrors] = useState<ClientFormErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notesOpen, setNotesOpen] = useState(Boolean(client?.notes));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmingChanges, setConfirmingChanges] = useState(false);
  const [changeSummary, setChangeSummary] = useState<ChangeSummary[]>([]);

  const selectedDaysCount = values.selected_days.length;

  const estimate = estimateClientEarnings({
    pricePerVisit: Number(values.price_per_visit || 0),
    visitsPerWeek: selectedDaysCount,
    paymentMethod: values.payment_method,
    commissionRate: ROVER_COMMISSION_RATE
  });

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
      pets: current.pets.filter((_, petIndex) => petIndex !== index)
    }));
  }

  function selectPhoto(index: number, event: ChangeEvent<HTMLInputElement>) {
    updatePet(index, { photoFile: event.target.files?.[0] ?? null });
  }

  function toggleDay(day: string) {
    setValues((current) => ({
      ...current,
      selected_days: current.selected_days.includes(day)
        ? current.selected_days.filter((selectedDay) => selectedDay !== day)
        : [...current.selected_days, day].sort((a, b) => WEEK_DAYS.indexOf(a) - WEEK_DAYS.indexOf(b))
    }));
    setErrors((current) => ({ ...current, selected_days: undefined }));
  }

  function validate() {
    const nextErrors: ClientFormErrors = {};
    if (!values.name.trim()) nextErrors.name = "Client name is required.";
    if (!values.address.trim()) nextErrors.address = "Address is required.";
    if (!values.pets.length) {
      nextErrors.pets = "Add at least one pet.";
    } else if (values.pets.some((pet) => !pet.name.trim() || !pet.type)) {
      nextErrors.pets = "Each pet needs a name and type.";
    }
    if (!values.payment_method) {
      nextErrors.payment_method = "Choose a payment method.";
    }
    if (!values.price_per_visit || Number(values.price_per_visit) <= 0) {
      nextErrors.price_per_visit = "Enter a price per visit greater than $0.";
    }
    if (values.selected_days.length === 0) {
      nextErrors.selected_days = "Select at least one visit day";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function uploadPetPhoto(pet: ClientFormPet, ownerId: string) {
    if (!pet.photoFile || !supabase) {
      return {
        photo_url: pet.photo_url ?? null,
        photo_filename: pet.photo_filename ?? null
      };
    }

    const uploadPhoto = await preparePetPhotoForUpload(pet.photoFile);
    const originalName = sanitizeFilename(pet.photoFile.name).replace(/\.[^.]+$/, "");
    const filename = `${Date.now()}-${originalName || "pet-photo"}.${uploadPhoto.extension}`;
    const path = `${ownerId}/pets/${filename}`;
    const { error } = await supabase.storage.from("pet-photos").upload(path, uploadPhoto.file, {
      contentType: uploadPhoto.contentType,
      upsert: false
    });

    if (error) throw error;

    return {
      photo_url: path,
      photo_filename: pet.photoFile.name
    };
  }

  async function preparePetPhotoForUpload(file: File) {
    if (isHeicPhoto(file)) {
      return {
        file,
        extension: file.name.toLowerCase().endsWith(".heif") ? "heif" : "heic",
        contentType: file.type || HEIC_CONTENT_TYPE
      };
    }

    return {
      file: await compressPetPhoto(file),
      extension: "jpg",
      contentType: "image/jpeg"
    };
  }

  function isHeicPhoto(file: File) {
    const name = file.name.toLowerCase();
    return file.type === "image/heic" || file.type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
  }

  async function compressPetPhoto(file: File) {
    const imageUrl = URL.createObjectURL(file);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error("Could not load pet photo."));
        nextImage.src = imageUrl;
      });

      const scale = Math.min(1, MAX_PET_PHOTO_SIZE / image.width, MAX_PET_PHOTO_SIZE / image.height);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare pet photo for upload.");

      context.drawImage(image, 0, 0, width, height);

      let outputCanvas = canvas;
      let quality = 0.82;
      let blob = await canvasToJpegBlob(outputCanvas, quality);

      while (blob.size > MAX_PET_PHOTO_BYTES && quality > 0.3) {
        quality -= 0.08;
        blob = await canvasToJpegBlob(outputCanvas, quality);
      }

      while (blob.size > MAX_PET_PHOTO_BYTES && outputCanvas.width > 160 && outputCanvas.height > 160) {
        outputCanvas = resizeCanvas(outputCanvas, 0.85);
        quality = 0.72;
        blob = await canvasToJpegBlob(outputCanvas, quality);

        while (blob.size > MAX_PET_PHOTO_BYTES && quality > 0.3) {
          quality -= 0.08;
          blob = await canvasToJpegBlob(outputCanvas, quality);
        }
      }

      return blob;
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number) {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Could not compress pet photo."));
          }
        },
        "image/jpeg",
        quality
      );
    });
  }

  function resizeCanvas(sourceCanvas: HTMLCanvasElement, scale: number) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
    canvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not resize pet photo.");

    context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function normalizeBlank(value: string | null | undefined) {
    return value?.trim() || "None";
  }

  function petsLabel(pets: ClientFormPet[]) {
    if (pets.length === 0) return "None";
    return pets
      .map((pet) => {
        const photoNote = pet.photoFile ? ", new photo" : "";
        return `${pet.name.trim() || "Unnamed"} (${pet.type}${photoNote})`;
      })
      .join(", ");
  }

  function buildChangeSummary() {
    if (!client) return [];
    const originalValues = valuesFromClient(client);
    const changes: ChangeSummary[] = [];

    function addChange(label: string, before: string, after: string) {
      if (before !== after) changes.push({ label, before, after });
    }

    addChange("Name", normalizeBlank(originalValues.name), normalizeBlank(values.name));
    addChange("Address", normalizeBlank(originalValues.address), normalizeBlank(values.address));
    addChange("Payment method", originalValues.payment_method, values.payment_method);
    addChange("Status", originalValues.status, values.status);
    addChange(
      "Service",
      originalValues.service_type === "Custom"
        ? normalizeBlank(originalValues.custom_service_type)
        : originalValues.service_type,
      values.service_type === "Custom" ? normalizeBlank(values.custom_service_type) : values.service_type
    );
    addChange(
      "Price per visit",
      formatCurrency(Number(originalValues.price_per_visit || 0)),
      formatCurrency(Number(values.price_per_visit || 0))
    );
    addChange("Visit days", selectedDaysLabel(originalValues.selected_days) || "None", selectedDaysLabel(values.selected_days) || "None");
    addChange("Pets", petsLabel(originalValues.pets), petsLabel(values.pets));
    addChange("Notes", normalizeBlank(originalValues.notes), normalizeBlank(values.notes));

    return changes;
  }

  async function saveClient() {
    if (!supabase) return;
    const ownerId = client?.user_id ?? userId;
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        user_id: ownerId,
        name: values.name.trim(),
        address: values.address.trim(),
        payment_method: values.payment_method,
        status: values.status,
        service_type: values.service_type,
        custom_service_type: values.service_type === "Custom" ? values.custom_service_type.trim() || null : null,
        price_per_visit: Number(Number(values.price_per_visit || 0).toFixed(2)),
        frequency_label: selectedDaysLabel(values.selected_days),
        visits_per_week: selectedDaysCount,
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

      if (values.pets.length > 0) {
        const petsPayload = await Promise.all(
          values.pets.map(async (pet) => ({
            user_id: ownerId,
            client_id: clientId,
            name: pet.name.trim(),
            type: pet.type,
            ...(await uploadPetPhoto(pet, ownerId))
          }))
        );

        const { error: petsError } = await supabase.from("pets").insert(petsPayload);
        if (petsError) throw petsError;
      }

      onSaved();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong while saving.");
    } finally {
      setSaving(false);
      setConfirmingChanges(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate() || !supabase) return;

    if (client) {
      const changes = buildChangeSummary();
      if (changes.length === 0) {
        setFormError("No changes to update.");
        return;
      }

      setFormError("");
      setChangeSummary(changes);
      setConfirmingChanges(true);
      return;
    }

    await saveClient();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-4">
        <Input
          label="Name"
          value={values.name}
          error={errors.name}
          placeholder="Maya"
          onChange={(event) => update("name", event.target.value)}
        />
        <AddressAutocomplete
          label="Address"
          value={values.address}
          error={errors.address}
          placeholder="Search by address or building name"
          onChange={(nextAddress) => update("address", nextAddress)}
        />
      </div>

      <div className="space-y-3">
        {values.pets.length > 0 ? (
          <div className="space-y-3">
            {values.pets.map((pet, index) => (
              <div
                key={pet.id ?? index}
                className="rounded-[20px] border border-border bg-surface p-4 shadow-card transition duration-200 ease-in-out"
              >
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
              <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3 text-[14px] font-medium text-text-secondary transition hover:bg-[#FBFAF7] active:scale-[0.99]">
                <Camera size={16} strokeWidth={1.6} />
                {pet.photoFile?.name ?? pet.photo_filename ?? "Add pet photo"}
                <input className="sr-only" type="file" accept="image/*" onChange={(event) => selectPhoto(index, event)} />
              </label>
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
          <FieldShell label="Payment method" error={errors.payment_method}>
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

          {!hideStatusField ? (
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
          ) : null}

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
            <FieldShell label="Visit days" error={errors.selected_days}>
              <div
                className={cn(
                  "grid grid-cols-7 gap-1.5 rounded-2xl border bg-subtle p-1.5",
                  errors.selected_days ? "border-danger" : "border-border"
                )}
              >
                {WEEK_DAYS.map((day) => {
                  const active = values.selected_days.includes(day);
                  return (
                    <button
                      key={day}
                      className={cn(
                        "min-h-11 rounded-xl text-[13px] font-medium transition duration-200 ease-in-out active:scale-[0.96]",
                        active
                          ? "bg-accent text-text-primary shadow-sm"
                          : "bg-transparent text-text-tertiary hover:bg-surface hover:text-text-secondary"
                      )}
                      type="button"
                      onClick={() => toggleDay(day)}
                      aria-pressed={active}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[13px] text-text-secondary">
                {selectedDaysCount === 0
                  ? "Select visit days."
                  : `${selectedDaysCount} ${selectedDaysCount === 1 ? "visit" : "visits"} per week`}
              </p>
            </FieldShell>
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

      {statusHistory.length > 0 ? (
        <>
          <button
            className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-border bg-surface px-4 text-left text-[15px] font-medium text-text-secondary transition hover:bg-subtle"
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
          >
            Status history
            <ChevronDown className={cn("transition duration-200", historyOpen && "rotate-180")} size={18} strokeWidth={1.6} />
          </button>
          {historyOpen ? (
            <div className="space-y-3 rounded-[20px] border border-border bg-surface p-4 shadow-card">
              {statusHistory.map((entry) => (
                <div key={entry.id} className="flex gap-3 rounded-2xl bg-subtle px-4 py-3">
                  <span className={cn("mt-1 h-3 w-3 shrink-0 rounded-full", entry.status === "Active" ? "bg-success" : "bg-text-tertiary")} />
                  <div>
                    <div className="text-[14px] font-medium text-text-primary">{entry.status}</div>
                    <div className="text-[13px] text-text-secondary">
                      {formatShortDate(entry.start_date)} - {entry.end_date ? formatShortDate(entry.end_date) : "Present"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {formError ? <p className="text-[13px] text-danger">{formError}</p> : null}

      <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-border bg-page/90 px-4 py-4 backdrop-blur-xl sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button className="w-full" variant="accent" type="submit" disabled={saving}>
          {saving ? "Saving..." : client ? "Update client" : "Add client"}
        </Button>
        <Button variant="soft" type="button" onClick={onCancel} aria-label="Cancel">
          <X size={18} strokeWidth={1.6} />
        </Button>
      </div>

      {confirmingChanges ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-[#1A1916]/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[520px] rounded-[20px] border border-border bg-surface p-5 shadow-[0_22px_70px_rgba(48,38,24,0.2)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[22px] font-medium leading-tight text-text-primary">Confirm client changes</h3>
                <p className="mt-2 text-[14px] text-text-secondary">Review what changed before updating this client.</p>
              </div>
            </div>

            <div className="mt-5 max-h-[48vh] space-y-2 overflow-y-auto">
              {changeSummary.map((change) => (
                <div key={change.label} className="rounded-2xl bg-subtle p-3">
                  <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
                    {change.label}
                  </div>
                  <div className="mt-1 text-[14px] leading-snug text-text-primary">
                    <span className="text-text-secondary">{change.before}</span>
                    <span className="px-2 text-text-tertiary">-&gt;</span>
                    <span className="font-medium">{change.after}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="soft" type="button" onClick={() => setConfirmingChanges(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="accent" type="button" onClick={saveClient} disabled={saving}>
                {saving ? "Saving..." : "Confirm changes"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-[94px] min-w-0 flex-col justify-between overflow-hidden rounded-2xl bg-subtle p-3">
      <div className="line-clamp-2 min-h-[28px] text-[11px] font-medium uppercase leading-[1.25] tracking-[0.04em] text-text-tertiary">
        {label}
      </div>
      <div className="truncate font-medium tabular-nums leading-none text-text-primary text-[clamp(15px,3.6vw,18px)]">
        {value}
      </div>
    </div>
  );
}

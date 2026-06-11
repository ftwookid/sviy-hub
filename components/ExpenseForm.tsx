"use client";

import Image from "next/image";
import { Paperclip, Upload } from "lucide-react";
import { ChangeEvent, FormEvent, RefObject, useEffect, useState } from "react";
import { SCHEDULE_C_CATEGORIES } from "@/lib/categories";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import { sanitizeFilename, todayInputValue } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
import type { Expense, ExpenseFormValues, PaymentMethod } from "@/types/expense";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input, Select, Textarea } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

type FormErrors = Partial<Record<keyof ExpenseFormValues, string>>;

const emptyValues = (): ExpenseFormValues => ({
  date: todayInputValue(),
  merchant: "",
  description: "",
  amount: "",
  category: SCHEDULE_C_CATEGORIES[0],
  payment_method: "Main card",
  notes: ""
});

export function ExpenseForm({
  userId,
  expense,
  merchantInputRef,
  onSaved,
  onCancel
}: {
  userId: string;
  expense?: Expense | null;
  merchantInputRef?: RefObject<HTMLInputElement>;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<ExpenseFormValues>(() =>
    expense
      ? {
          date: expense.date,
          merchant: expense.merchant,
          description: expense.description ?? "",
          amount: String(expense.amount),
          category: expense.category,
          payment_method: expense.payment_method,
          notes: expense.notes ?? ""
        }
      : emptyValues()
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!receipt || !receipt.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(receipt);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [receipt]);

  function updateValue<K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const nextErrors: FormErrors = {};
    if (!values.date) nextErrors.date = "Choose a date.";
    if (!values.merchant.trim()) nextErrors.merchant = "Merchant is required.";
    if (!values.amount || Number(values.amount) <= 0) nextErrors.amount = "Enter an amount over 0.";
    if (!values.category) nextErrors.category = "Choose a category.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleReceipt(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setReceipt(file);
  }

  async function uploadReceipt() {
    if (!receipt || !supabase) {
      return {
        receipt_url: expense?.receipt_url ?? null,
        receipt_filename: expense?.receipt_filename ?? null
      };
    }

    const date = new Date(`${values.date}T12:00:00`);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const filename = `${Date.now()}-${sanitizeFilename(receipt.name)}`;
    const path = `${userId}/${year}/${month}/${filename}`;

    const { error } = await supabase.storage.from("receipts").upload(path, receipt, {
      upsert: false
    });

    if (error) throw error;

    return {
      receipt_url: path,
      receipt_filename: receipt.name
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate() || !supabase) return;

    setSaving(true);
    setFormError("");
    try {
      const receiptData = await uploadReceipt();
      const payload = {
        date: values.date,
        merchant: values.merchant.trim(),
        description: values.description.trim() || null,
        amount: Number(Number(values.amount).toFixed(2)),
        category: values.category,
        payment_method: values.payment_method,
        notes: values.notes.trim() || null,
        user_id: userId,
        ...receiptData
      };

      const query = expense
        ? supabase.from("expenses").update(payload).eq("id", expense.id)
        : supabase.from("expenses").insert(payload);

      const { error } = await query;
      if (error) throw error;

      if (!expense) {
        setValues(emptyValues());
        setReceipt(null);
      }
      onSaved();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong while saving.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Date"
          type="date"
          value={values.date}
          error={errors.date}
          onChange={(event) => updateValue("date", event.target.value)}
        />
        <Input
          ref={merchantInputRef}
          label="Merchant"
          placeholder="Delta Air Lines"
          value={values.merchant}
          error={errors.merchant}
          onChange={(event) => updateValue("merchant", event.target.value)}
        />
        <Input
          label="Description"
          placeholder="Client trip"
          value={values.description}
          onChange={(event) => updateValue("description", event.target.value)}
        />
        <Input
          label="Amount"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder="0.00"
          value={values.amount}
          error={errors.amount}
          onChange={(event) => updateValue("amount", event.target.value)}
        />
        <Select
          label="Category"
          value={values.category}
          error={errors.category}
          onChange={(event) => updateValue("category", event.target.value)}
        >
          {SCHEDULE_C_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </Select>
        <FieldShell label="Payment method">
          <div className="grid h-10 grid-cols-3 rounded-lg border border-border bg-subtle p-1">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method}
                className={cn(
                  "focus-ring rounded-md text-[12px] transition duration-150 ease-in-out",
                  values.payment_method === method
                    ? "bg-surface text-text-primary shadow-sm"
                    : "text-text-secondary hover:bg-[#ECEAE5]"
                )}
                type="button"
                onClick={() => updateValue("payment_method", method as PaymentMethod)}
              >
                {method}
              </button>
            ))}
          </div>
        </FieldShell>
        <FieldShell label="Receipt">
          <label className="focus-ring flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border-emphasis bg-subtle px-3 text-[13px] text-text-secondary transition hover:bg-border">
            <Upload size={16} strokeWidth={1.5} />
            Choose file
            <input
              className="sr-only"
              type="file"
              accept="image/*,.pdf,application/pdf"
              onChange={handleReceipt}
            />
          </label>
          {receipt ? (
            <div className="mt-3">
              {previewUrl ? (
                <div className="relative h-24 w-24 overflow-hidden rounded-lg border border-border bg-subtle">
                  <Image src={previewUrl} alt="Receipt preview" fill className="object-cover" />
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-md bg-accent-soft px-3 py-2 text-[12px] text-text-secondary">
                  <Paperclip size={14} strokeWidth={1.5} />
                  {receipt.name}
                </div>
              )}
            </div>
          ) : null}
        </FieldShell>
        <div className="sm:col-span-2">
          <Textarea
            label="Notes"
            placeholder="Optional"
            value={values.notes}
            onChange={(event) => updateValue("notes", event.target.value)}
          />
        </div>
      </div>
      <div className="mt-5 flex gap-3">
        <Button className="w-full" variant="accent" type="submit" disabled={saving}>
          {saving ? "Saving..." : expense ? "Save changes" : "Add expense"}
        </Button>
        {onCancel ? (
          <Button variant="soft" type="button" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
      {formError ? <p className="mt-3 text-[12px] text-danger">{formError}</p> : null}
    </form>
  );
}

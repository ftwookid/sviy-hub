"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Paperclip, Trash2, Upload, X } from "lucide-react";
import { authedFetch } from "@/lib/apiClient";
import { Button } from "@/components/ui/Button";
import { CloseButton } from "@/components/ui/CloseButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateField } from "@/components/ui/DateField";
import { FieldShell, Input, Select, Textarea } from "@/components/ui/Field";
import { PaymentMethodPicker } from "@/components/expenses/PaymentMethodPicker";
import { ProofBadge } from "@/components/expenses/ProofBadge";
import { DEFAULT_CATEGORY, EXPENSE_CATEGORIES, normalizeCategory } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { deleteExpenses } from "@/lib/expenseDelete";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useScrollLock } from "@/lib/useScrollLock";
import { proofState } from "@/lib/expenses";
import { todayInputValue } from "@/lib/formatters";
import { DEFAULT_PAYMENT_METHOD } from "@/lib/paymentMethods";
import { formatBytes } from "@/lib/receiptImage";
import { receiptViewUrl, uploadReceipt } from "@/lib/receiptUpload";
import { supabase } from "@/lib/supabase";
import type { Expense, ExpenseFormValues, Receipt } from "@/types/expense";

type FormErrors = Partial<Record<keyof ExpenseFormValues, string>>;

function initialValues(expense?: Expense, defaultDate?: string): ExpenseFormValues {
  if (!expense) {
    return {
      date: defaultDate ?? todayInputValue(),
      merchant: "",
      description: "",
      amount: "",
      category: EXPENSE_CATEGORIES[0],
      payment_method: DEFAULT_PAYMENT_METHOD,
      notes: ""
    };
  }

  return {
    date: expense.date,
    merchant: expense.merchant,
    description: expense.description ?? "",
    amount: String(expense.amount),
    // An expense saved under an old Schedule C heading has no matching option
    // in the select, which would silently save it as whatever sits at the top.
    category: normalizeCategory(expense.category) ?? DEFAULT_CATEGORY,
    payment_method: expense.payment_method,
    notes: expense.notes ?? ""
  };
}

export function ExpenseSlideOver({
  expense,
  receipt,
  userId,
  defaultDate,
  onClose,
  onSaved,
  onDeleted
}: {
  expense?: Expense;
  receipt?: Receipt | null;
  userId: string;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const isEditing = Boolean(expense);
  const [values, setValues] = useState<ExpenseFormValues>(() => initialValues(expense, defaultDate));
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [attachedReceipt, setAttachedReceipt] = useState<Receipt | null>(receipt ?? null);
  // Receipts dropped or swapped out during this edit. They are only retired
  // once the save succeeds, so closing without saving leaves Drive untouched.
  const [retiredReceiptIds, setRetiredReceiptIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState("");
  const [waived, setWaived] = useState(expense?.proof_waived ?? false);
  const [proofNote, setProofNote] = useState(expense?.proof_note ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The delete confirmation stacks on top of this panel; the hook's stack sends
  // the keypress there first, so one press backs out of one thing.
  useEscapeKey(onClose);
  useScrollLock();

  function update<K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: FormErrors = {};
    if (!values.date) next.date = "Choose a date.";
    if (!values.merchant.trim()) next.merchant = "Merchant is required.";
    if (!values.amount || Number(values.amount) <= 0) next.amount = "Enter an amount over $0.";
    if (!values.category) next.category = "Choose a category.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function retireReceipt(receiptId: string) {
    setRetiredReceiptIds((current) =>
      current.includes(receiptId) ? current : [...current, receiptId]
    );
  }

  /**
   * Brings Drive in line with the transaction that was just saved: retires the
   * receipts this edit dropped, re-files the attached one if its month moved,
   * and archives it if it is not in Drive yet.
   *
   * Deliberately non-fatal. The expense is already saved by this point, so a
   * Drive hiccup is recorded against the receipt (and shown as "Waiting to
   * archive") rather than presented as a failed save.
   */
  async function reconcileArchive() {
    for (const receiptId of retiredReceiptIds) {
      try {
        await authedFetch("/api/receipts/discard", {
          method: "POST",
          body: JSON.stringify({ receiptId })
        });
      } catch {
        // Recorded server-side; the receipt row is the source of truth.
      }
    }
    setRetiredReceiptIds([]);

    if (!attachedReceipt) return;

    try {
      await authedFetch("/api/receipts/refile", {
        method: "POST",
        body: JSON.stringify({ receiptId: attachedReceipt.id, date: values.date })
      });
      await authedFetch("/api/receipts/sync", {
        method: "POST",
        body: JSON.stringify({ receiptId: attachedReceipt.id })
      });
    } catch {
      // Same reasoning: the manual Sync button retries anything left behind.
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setUploadNote("");
    setFormError("");

    try {
      const result = await uploadReceipt(file, userId, values.date);
      if (attachedReceipt) retireReceipt(attachedReceipt.id);
      setAttachedReceipt(result.receipt);
      setWaived(false);
      setUploadNote(
        result.storedBytes < result.originalBytes
          ? `Compressed ${formatBytes(result.originalBytes)} to ${formatBytes(result.storedBytes)}.`
          : `Uploaded ${formatBytes(result.storedBytes)}.`
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not upload that file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function openReceipt() {
    if (!attachedReceipt) return;
    const url = await receiptViewUrl(attachedReceipt);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !validate()) return;

    setSaving(true);
    setFormError("");

    try {
      const payload = {
        date: values.date,
        merchant: values.merchant.trim(),
        description: values.description.trim() || null,
        amount: Number(Number(values.amount).toFixed(2)),
        category: values.category,
        payment_method: values.payment_method,
        notes: values.notes.trim() || null,
        receipt_id: attachedReceipt?.id ?? null,
        proof_waived: attachedReceipt ? false : waived,
        proof_note: !attachedReceipt && waived ? proofNote.trim() || null : null,
        user_id: expense?.user_id ?? userId,
        updated_at: new Date().toISOString()
      };

      const { error } = expense
        ? await supabase.from("expenses").update(payload).eq("id", expense.id)
        : await supabase.from("expenses").insert({ ...payload, expense_type: "Standard" });

      if (error) throw error;
      await reconcileArchive();
      onSaved();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save this expense.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!supabase || !expense) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteExpenses([expense.id], attachedReceipt ? [attachedReceipt.id] : []);
      setConfirmingDelete(false);
      onDeleted();
    } catch (error) {
      // Kept on the dialog rather than behind it, so the reason is where the
      // user just clicked.
      setDeleteError(error instanceof Error ? error.message : "Could not delete this expense.");
    } finally {
      setDeleting(false);
    }
  }

  const currentProof = proofState({
    receipt_id: attachedReceipt?.id ?? null,
    proof_waived: waived
  });

  return (
    <div className="fixed inset-0 z-[60] bg-[#1A1916]/20 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="slide-over-panel ml-auto flex h-full w-full max-w-[560px] flex-col overflow-y-auto bg-page p-4 shadow-[0_20px_70px_rgba(48,38,24,0.18)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-figure-lg font-semibold leading-[1.15] tracking-[-0.01em] text-text-primary sm:text-display-sm">
              {isEditing ? "Edit transaction" : "Add transaction"}
            </h2>
            <p className="mt-1 text-body text-text-secondary">
              {isEditing
                ? "Update details or attach the proof you were missing."
                : "Log it now — you can attach the receipt later."}
            </p>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              label="Date"
              value={values.date}
              error={errors.date}
              onChange={(next) => update("date", next)}
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
              onChange={(event) => update("amount", event.target.value)}
            />
          </div>

          <Input
            label="Merchant"
            placeholder="Chewy"
            value={values.merchant}
            error={errors.merchant}
            onChange={(event) => update("merchant", event.target.value)}
          />

          <Input
            label="Description"
            placeholder="Dog food for boarding clients"
            value={values.description}
            onChange={(event) => update("description", event.target.value)}
          />

          <Select
            label="Category"
            value={values.category}
            error={errors.category}
            onChange={(event) => update("category", event.target.value)}
          >
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>

          <FieldShell label="Payment method">
            <PaymentMethodPicker
              value={values.payment_method}
              userId={userId}
              onChange={(method) => update("payment_method", method)}
            />
          </FieldShell>

          {/* Proof of transaction */}
          <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-list font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                Proof of transaction
              </h3>
              <ProofBadge state={currentProof} />
            </div>

            {attachedReceipt ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-subtle px-3 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Paperclip size={15} strokeWidth={1.7} className="shrink-0 text-text-tertiary" />
                  <div className="min-w-0">
                    <div className="truncate text-body font-medium text-text-primary">
                      {attachedReceipt.filename}
                    </div>
                    <div className="text-meta text-text-tertiary">
                      {attachedReceipt.drive_synced_at ? "Archived in Drive" : "Waiting to archive"}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    className="h-9 w-9 px-0"
                    variant="ghost"
                    type="button"
                    aria-label="Open receipt"
                    onClick={openReceipt}
                  >
                    <ExternalLink size={16} strokeWidth={1.7} />
                  </Button>
                  <Button
                    className="h-9 w-9 px-0"
                    variant="ghost"
                    type="button"
                    aria-label="Remove receipt"
                    onClick={() => {
                      retireReceipt(attachedReceipt.id);
                      setAttachedReceipt(null);
                    }}
                  >
                    <X size={16} strokeWidth={1.7} />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <label
                  className={cn(
                    "focus-ring-within mt-3 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-emphasis bg-subtle px-3 text-body text-text-secondary transition hover:bg-border",
                    uploading && "pointer-events-none opacity-60"
                  )}
                >
                  <Upload size={16} strokeWidth={1.6} />
                  {uploading ? "Uploading..." : "Attach receipt, invoice, or photo"}
                  <input
                    ref={fileInputRef}
                    className="sr-only"
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    disabled={uploading}
                    onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                  />
                </label>

                <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-list text-text-secondary">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#C9A96E]"
                    checked={waived}
                    onChange={(event) => setWaived(event.target.checked)}
                  />
                  <span>No receipt exists for this one — stop flagging it as missing.</span>
                </label>

                {waived ? (
                  <div className="mt-2">
                    <Input
                      label="Why there is no receipt"
                      placeholder="Cash tip, no receipt issued"
                      value={proofNote}
                      onChange={(event) => setProofNote(event.target.value)}
                    />
                  </div>
                ) : null}
              </>
            )}

            {uploadNote ? <p className="mt-2 text-meta text-text-tertiary">{uploadNote}</p> : null}
          </section>

          <Textarea
            label="Notes"
            placeholder="Optional"
            value={values.notes}
            onChange={(event) => update("notes", event.target.value)}
          />

          {formError ? <p className="text-list text-danger">{formError}</p> : null}

          {isEditing ? (
            <Button
              className="w-full sm:w-auto"
              variant="danger"
              type="button"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 size={16} strokeWidth={1.7} />
              Delete transaction
            </Button>
          ) : null}

          <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-border bg-page/90 px-4 py-4 pb-[calc(16px+env(safe-area-inset-bottom))] backdrop-blur-xl sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            <Button className="w-full" variant="accent" type="submit" disabled={saving || uploading}>
              {saving ? "Saving..." : isEditing ? "Save changes" : "Add transaction"}
            </Button>
            <Button
              className="w-11 shrink-0 px-0"
              variant="soft"
              type="button"
              onClick={onClose}
              aria-label="Cancel"
            >
              <X size={18} strokeWidth={1.6} />
            </Button>
          </div>
        </form>
      </aside>

      {confirmingDelete && expense ? (
        <ConfirmDialog
          title="Delete this transaction?"
          description={`${expense.merchant} will be permanently removed from your records. Any attached receipt moves to your Drive trash, where it stays recoverable for 30 days.`}
          confirmLabel="Delete"
          cancelLabel="Keep it"
          busy={deleting}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => {
            setDeleteError("");
            setConfirmingDelete(false);
          }}
        />
      ) : null}
    </div>
  );
}

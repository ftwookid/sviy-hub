"use client";

import { Button } from "@/components/ui/Button";
import { useEscapeKey } from "@/lib/useEscapeKey";

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = "Keep it",
  tone = "danger",
  busy = false,
  error,
  onConfirm,
  onCancel
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "accent";
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscapeKey(onCancel, !busy);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#1A1916]/30 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      // Stop here. This dialog is rendered inside panels whose own backdrop
      // closes them (Utilities, Setup), so a click meant to dismiss the question
      // would otherwise carry on through and shut the panel behind it — which is
      // the opposite of what a confirmation is for.
      onClick={(event) => {
        event.stopPropagation();
        if (!busy) onCancel();
      }}
    >
      <div
        className="sheet-panel w-full max-w-[420px] rounded-t-[28px] border border-border bg-surface p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-[0_24px_70px_rgba(48,38,24,0.24)] sm:rounded-[24px] sm:pb-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-figure font-semibold leading-tight text-text-primary">{title}</h3>
        <p className="mt-2 text-body leading-snug text-text-secondary">{description}</p>
        {error ? <p className="mt-3 text-list text-danger">{error}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <Button className="w-full" variant="soft" type="button" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          {/* The tone is the variant, not a class bolted onto another one:
              `cn` is a plain join, so `bg-danger` beside `primary`'s
              `bg-text-primary` was decided by Tailwind's own source order — and
              lost. Every destructive confirmation in the app has been rendering
              in the ordinary near-black. */}
          <Button
            className="w-full"
            variant={tone === "danger" ? "destructive" : "accent"}
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

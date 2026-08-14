"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

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
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#1A1916]/30 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="sheet-panel w-full max-w-[420px] rounded-t-[28px] border border-border bg-surface p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-[0_24px_70px_rgba(48,38,24,0.24)] sm:rounded-[24px] sm:pb-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-[19px] font-medium leading-tight text-text-primary">{title}</h3>
        <p className="mt-2 text-[14px] leading-snug text-text-secondary">{description}</p>
        {error ? <p className="mt-3 text-[13px] text-danger">{error}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <Button className="w-full" variant="soft" type="button" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            className={cn("w-full", tone === "danger" && "bg-danger text-white hover:bg-[#B14444]")}
            variant={tone === "danger" ? "primary" : "accent"}
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

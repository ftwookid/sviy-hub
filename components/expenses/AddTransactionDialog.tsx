"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, FileText, Loader2, PenLine, UploadCloud } from "lucide-react";
import { cn } from "@/lib/cn";
import { periodMonthLabel } from "@/lib/expenses";
import { formatBytes } from "@/lib/receiptImage";
import type { StatementImport } from "@/types/statementImport";

/**
 * The one way transactions get in.
 *
 * There is a single Add button on the page; how the transaction arrives — typed
 * out, or read off a statement PDF — is a choice made after clicking it, not two
 * competing buttons the user has to pick between up front.
 */

/** The scan runs two model passes, so it is slow on purpose. Say so, honestly. */
const SCAN_STEPS = [
  "Reading the statement...",
  "Pulling out every transaction...",
  "Double-checking the numbers against the statement totals...",
  "Almost there — matching what you have categorised before..."
];

export function AddTransactionDialog({
  unfinished,
  scanning,
  scanError,
  onManual,
  onFile,
  onResume,
  onClose
}: {
  unfinished: StatementImport[];
  scanning: boolean;
  scanError: string;
  onManual: () => void;
  onFile: (file: File) => void;
  onResume: (importId: string) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"choose" | "upload">("choose");
  const [dragging, setDragging] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [pending, setPending] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !scanning) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, scanning]);

  function start(file: File | undefined) {
    if (!file) return;
    setPending(file);
    setScanStep(0);
    onFile(file);

    // The scan reports no progress of its own, so advance the copy on a timer.
    // A message that keeps changing is the honest way to say "still working".
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      if (index >= SCAN_STEPS.length) {
        window.clearInterval(timer);
        return;
      }
      setScanStep(index);
    }, 12_000);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#1A1916]/30 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add a transaction"
      onClick={() => {
        if (!scanning) onClose();
      }}
    >
      <div
        className="sheet-panel w-full max-w-[440px] rounded-t-[28px] border border-border bg-surface p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-[0_24px_70px_rgba(48,38,24,0.24)] sm:rounded-[24px] sm:pb-5"
        onClick={(event) => event.stopPropagation()}
      >
        {scanning ? (
          <div className="py-4 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] bg-accent-soft text-accent">
              <Loader2 size={24} strokeWidth={1.6} className="animate-spin" />
            </span>
            <h3 className="mt-4 text-[17px] font-medium text-text-primary">{SCAN_STEPS[scanStep]}</h3>
            <p className="mx-auto mt-2 max-w-xs text-[13px] leading-snug text-text-secondary">
              This takes a minute or two. Leave the page open — the transactions come back as a
              list you can go through.
            </p>
            {pending ? (
              <p className="mt-3 text-[12px] text-text-tertiary">
                {pending.name} · {formatBytes(pending.size)}
              </p>
            ) : null}
          </div>
        ) : step === "choose" ? (
          <>
            <h3 className="text-[19px] font-medium leading-tight text-text-primary">Add transactions</h3>

            <div className="mt-4 space-y-2">
              <ChoiceRow
                icon={PenLine}
                title="Type one in"
                caption="A single transaction, with its receipt."
                onClick={onManual}
              />
              <ChoiceRow
                icon={UploadCloud}
                title="Upload a statement"
                caption="Every transaction on a bank or card PDF, at once."
                onClick={() => setStep("upload")}
              />
            </div>

            {unfinished.length > 0 ? (
              <div className="mt-5">
                <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
                  Still to review
                </div>
                <div className="mt-2 space-y-1.5">
                  {unfinished.map((item) => (
                    <button
                      key={item.id}
                      className="focus-ring flex w-full items-center gap-2.5 rounded-xl bg-subtle px-3 py-2.5 text-left transition hover:bg-border"
                      type="button"
                      onClick={() => onResume(item.id)}
                    >
                      <FileText size={15} strokeWidth={1.8} className="shrink-0 text-text-tertiary" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium text-text-primary">
                          {item.institution || item.filename}
                        </div>
                        <div className="text-[12px] text-text-tertiary">
                          {item.period_month ? periodMonthLabel(item.period_month) : "Period unknown"}
                        </div>
                      </div>
                      <ChevronRight size={16} strokeWidth={1.8} className="shrink-0 text-text-tertiary" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <h3 className="text-[19px] font-medium leading-tight text-text-primary">
              Upload a statement
            </h3>
            <p className="mt-1.5 text-[13px] leading-snug text-text-secondary">
              Keep the business transactions, drop the rest. Nothing is written to your books
              until you say so.
            </p>

            <label
              className={cn(
                "focus-ring-within mt-4 flex cursor-pointer flex-col items-center justify-center rounded-[18px] border border-dashed px-4 py-8 text-center transition",
                dragging ? "border-accent bg-accent-soft" : "border-border-emphasis bg-page"
              )}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                start(event.dataTransfer.files?.[0]);
              }}
            >
              <span className="grid h-12 w-12 place-items-center rounded-[16px] bg-subtle text-text-tertiary">
                <UploadCloud size={22} strokeWidth={1.5} />
              </span>
              <span className="mt-3 text-[15px] font-medium text-text-primary">
                Drop a PDF here
              </span>
              <span className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl bg-text-primary px-3.5 text-[14px] font-medium text-white">
                <FileText size={16} strokeWidth={1.7} />
                Choose a file
              </span>
              <input
                ref={inputRef}
                className="sr-only"
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) => {
                  start(event.target.files?.[0]);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              />
            </label>

            {scanError ? (
              <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">
                {scanError}
              </p>
            ) : null}

            <button
              className="focus-ring mt-3 text-[13px] text-text-secondary transition hover:text-text-primary"
              type="button"
              onClick={() => setStep("choose")}
            >
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ChoiceRow({
  icon: Icon,
  title,
  caption,
  onClick
}: {
  icon: typeof PenLine;
  title: string;
  caption: string;
  onClick: () => void;
}) {
  return (
    <button
      className="focus-ring flex w-full items-center gap-3 rounded-2xl border border-border bg-page px-3.5 py-3 text-left transition hover:border-border-emphasis hover:bg-subtle"
      type="button"
      onClick={onClick}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-accent-soft text-accent">
        <Icon size={18} strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-text-primary">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-text-secondary">{caption}</span>
      </span>
      <ChevronRight size={17} strokeWidth={1.8} className="shrink-0 text-text-tertiary" />
    </button>
  );
}

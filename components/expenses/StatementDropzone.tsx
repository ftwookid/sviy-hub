"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/receiptImage";

/**
 * Drop target for a statement PDF.
 *
 * The scan runs two model passes over the document, so it is slow on purpose —
 * the progress copy walks through the steps rather than leaving a bare spinner
 * for a minute or more.
 */
const SCAN_STEPS = [
  "Reading the statement...",
  "Pulling out every transaction...",
  "Double-checking the numbers against the statement totals...",
  "Almost there — matching what you have categorised before..."
];

export function StatementDropzone({
  scanning,
  error,
  onFile
}: {
  scanning: boolean;
  error: string;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState<File | null>(null);

  function start(file: File | undefined) {
    if (!file) return;
    setPending(file);
    setStep(0);
    onFile(file);

    // Advance the copy on a timer. The scan gives no progress signal of its own,
    // and a message that changes is the honest way to say "still working".
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      if (index >= SCAN_STEPS.length) {
        window.clearInterval(timer);
        return;
      }
      setStep(index);
    }, 12_000);
  }

  return (
    <section>
      <label
        className={cn(
          "focus-ring flex cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed px-5 py-10 text-center transition",
          dragging ? "border-accent bg-accent-soft" : "border-border-emphasis bg-surface",
          scanning && "pointer-events-none opacity-80"
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
        <span
          className={cn(
            "grid h-14 w-14 place-items-center rounded-[20px]",
            scanning ? "bg-accent-soft text-accent" : "bg-subtle text-text-tertiary"
          )}
        >
          {scanning ? (
            <Loader2 size={24} strokeWidth={1.6} className="animate-spin" />
          ) : (
            <UploadCloud size={24} strokeWidth={1.5} />
          )}
        </span>

        {scanning ? (
          <>
            <span className="mt-4 text-[18px] font-medium text-text-primary">
              {SCAN_STEPS[step]}
            </span>
            <span className="mt-2 max-w-sm text-[14px] text-text-secondary">
              This takes a minute or two. Leave the page open — the transactions land
              here as a list you can go through.
            </span>
          </>
        ) : (
          <>
            <span className="mt-4 text-[18px] font-medium text-text-primary">
              Drop a bank statement PDF
            </span>
            <span className="mt-2 max-w-sm text-[14px] text-text-secondary">
              Every transaction on it comes back as a list. Keep the business ones,
              drop the rest — nothing is written to your books until you say so.
            </span>
            <span className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-text-primary px-4 text-[15px] font-medium text-white">
              <FileText size={17} strokeWidth={1.7} />
              Choose a PDF
            </span>
          </>
        )}

        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept=".pdf,application/pdf"
          disabled={scanning}
          onChange={(event) => {
            start(event.target.files?.[0]);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </label>

      {pending && scanning ? (
        <p className="mt-3 text-center text-[12px] text-text-tertiary">
          {pending.name} · {formatBytes(pending.size)}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[13px] text-danger">{error}</p>
      ) : null}
    </section>
  );
}

"use client";

import { CircleAlert, MinusCircle, Paperclip } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ProofState } from "@/types/expense";

const TONES: Record<ProofState, { className: string; label: string }> = {
  Attached: { className: "bg-success-soft text-success", label: "Proof" },
  Missing: { className: "bg-danger-soft text-danger", label: "No proof" },
  Waived: { className: "bg-[#F1F0ED] text-text-tertiary", label: "Waived" }
};

export function ProofBadge({ state, className }: { state: ProofState; className?: string }) {
  const tone = TONES[state];
  const Icon = state === "Attached" ? Paperclip : state === "Missing" ? CircleAlert : MinusCircle;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium",
        tone.className,
        className
      )}
    >
      <Icon size={12} strokeWidth={2} />
      {tone.label}
    </span>
  );
}

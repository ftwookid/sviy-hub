"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type FieldShellProps = {
  label: string;
  error?: string;
  /**
   * A control on the label's own line, right-aligned.
   *
   * For the thing that acts on the field as a whole — clearing an optional one,
   * most of it. Put beside the input instead, it eats the input's width: an end
   * date with a 44px ✕ next to it measured 260px on a 308px phone row, so the
   * field that mattered was the one that got squeezed. The label line is empty
   * anyway.
   */
  action?: ReactNode;
  children: ReactNode;
};

export function FieldShell({ label, error, action, children }: FieldShellProps) {
  return (
    <div className="block">
      <span className="mb-2 flex items-center justify-between gap-2">
        <span className="text-meta font-medium uppercase tracking-[0.04em] text-text-tertiary">{label}</span>
        {action}
      </span>
      {children}
      {error ? <span className="mt-1.5 block text-meta text-danger">{error}</span> : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, ...props },
  ref
) {
  return (
    <FieldShell label={label} error={error}>
      <input
        ref={ref}
        className={cn(
          "focus-ring min-h-11 w-full rounded-xl border border-border bg-subtle px-4 text-label text-text-primary placeholder:text-text-tertiary transition duration-200 ease-in-out hover:border-border-emphasis",
          className
        )}
        {...props}
      />
    </FieldShell>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
};

export function Select({ label, error, className, children, ...props }: SelectProps) {
  return (
    <FieldShell label={label} error={error}>
      <select
        className={cn(
          "focus-ring min-h-11 w-full rounded-xl border border-border bg-subtle px-4 text-label text-text-primary transition duration-200 ease-in-out hover:border-border-emphasis",
          className
        )}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
};

export function Textarea({ label, error, className, ...props }: TextareaProps) {
  return (
    <FieldShell label={label} error={error}>
      <textarea
        className={cn(
          "focus-ring min-h-24 w-full resize-y rounded-xl border border-border bg-subtle px-4 py-3 text-label text-text-primary placeholder:text-text-tertiary transition duration-200 ease-in-out hover:border-border-emphasis",
          className
        )}
        {...props}
      />
    </FieldShell>
  );
}

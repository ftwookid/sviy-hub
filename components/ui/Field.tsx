"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type FieldShellProps = {
  label: string;
  error?: string;
  children: ReactNode;
};

export function FieldShell({ label, error, children }: FieldShellProps) {
  return (
    <div className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
        {label}
      </span>
      {children}
      {error ? <span className="mt-1 block text-[11px] text-danger">{error}</span> : null}
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
          "focus-ring h-10 w-full rounded-lg border border-border bg-subtle px-3 text-[13px] text-text-primary placeholder:text-text-tertiary transition duration-150 ease-in-out hover:border-border-emphasis",
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
          "focus-ring h-10 w-full rounded-lg border border-border bg-subtle px-3 text-[13px] text-text-primary transition duration-150 ease-in-out hover:border-border-emphasis",
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
          "focus-ring min-h-20 w-full resize-y rounded-lg border border-border bg-subtle px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary transition duration-150 ease-in-out hover:border-border-emphasis",
          className
        )}
        {...props}
      />
    </FieldShell>
  );
}

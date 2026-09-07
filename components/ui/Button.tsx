"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "soft" | "ghost" | "danger" | "destructive";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  const variants = {
    primary: "bg-text-primary text-white hover:bg-[#2A2823]",
    accent: "bg-accent text-text-primary hover:bg-[#BE9E62]",
    soft: "bg-subtle text-text-primary hover:bg-border",
    ghost: "bg-transparent text-text-secondary hover:bg-subtle",
    danger: "bg-danger-soft text-danger hover:bg-[#F3DADA]",
    // Solid red, for the button that actually destroys something. `danger` is
    // the pale one — right for a secondary control, and not enough weight for
    // the confirming half of a confirmation, which has to read as destructive
    // at rest on a phone that has no hover to turn it red.
    destructive: "bg-danger text-white hover:bg-[#7F2F2F]"
  };

  return (
    <button
      className={cn(
        "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-medium transition duration-150 ease-out",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

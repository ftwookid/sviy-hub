"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "soft" | "ghost" | "danger";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  const variants = {
    primary: "bg-text-primary text-white hover:bg-[#2A2823]",
    accent: "bg-accent text-text-primary hover:bg-[#BE9E62]",
    soft: "bg-subtle text-text-primary hover:bg-border",
    ghost: "bg-transparent text-text-secondary hover:bg-subtle",
    danger: "bg-danger-soft text-danger hover:bg-[#F3DADA]"
  };

  return (
    <button
      className={cn(
        "focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-medium transition duration-150 ease-in-out",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

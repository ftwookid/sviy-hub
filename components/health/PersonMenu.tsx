"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type Person = { id: string; label: string };

function Avatar({ label, size = "sm", active }: { label: string; size?: "sm" | "md"; active?: boolean }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-medium text-text-primary",
        size === "sm" ? "h-9 w-9 text-list" : "h-8 w-8 text-list",
        active ? "bg-accent" : "bg-accent-soft"
      )}
    >
      {label[0]?.toUpperCase()}
    </span>
  );
}

/**
 * Whose readings are on screen, and how to change that.
 *
 * It is an avatar rather than a row of tabs because a person is context, not
 * navigation — but tapping it opens the list rather than silently swapping.
 * A control that changes what you are looking at should show you what it is
 * changing to; a blind toggle makes the reader check the screen afterwards to
 * find out what happened.
 */
export function PersonMenu({
  people,
  personId,
  onSelect
}: {
  people: Person[];
  personId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = people.find((person) => person.id === personId) ?? null;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!current || people.length < 2) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Showing ${current.label}. Change person`}
        onClick={() => setOpen((value) => !value)}
        className="focus-ring rounded-full transition-opacity duration-200 ease-out hover:opacity-80"
      >
        <Avatar label={current.label} />
      </button>

      {open ? (
        <div
          role="menu"
          className="popover-panel absolute right-0 top-[calc(100%+8px)] z-40 min-w-[172px] rounded-2xl border border-border bg-surface p-1 shadow-[0_16px_40px_rgba(80,66,44,0.16)]"
        >
          {people.map((person) => {
            const active = person.id === personId;
            return (
              <button
                key={person.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onSelect(person.id);
                  setOpen(false);
                }}
                className={cn(
                  "focus-ring flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 text-left text-body transition-colors duration-200 ease-out",
                  active ? "bg-accent-soft/70 font-medium text-text-primary" : "text-text-secondary hover:bg-subtle"
                )}
              >
                <Avatar label={person.label} size="md" active={active} />
                <span className="min-w-0 flex-1 truncate">{person.label}</span>
                {active ? <Check size={15} strokeWidth={2} className="shrink-0 text-accent" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

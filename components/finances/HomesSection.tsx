"use client";

import { useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { DateField } from "@/components/ui/DateField";
import { FieldShell } from "@/components/ui/Field";
import { formatDateWithYear, todayInputValue } from "@/lib/formatters";
import { sortHomes } from "@/lib/financeHomes";
import type { FinanceHome } from "@/types/finance";

/**
 * Where the household has lived, in the panel where standing figures are typed.
 *
 * It belongs in Setup rather than beside the chart that uses it, for the same
 * reason the car's fuel economy lives in Profile and not on Mileage: an address
 * is entered twice in a decade and read every time a bill is opened. Putting the
 * form next to the reading would charge every visit for a field almost nobody
 * touches.
 *
 * **One date per home, and no end date.** A home runs until the next one starts,
 * so there is nothing to keep in step — the commonest way a dated pair of fields
 * goes wrong is one row's end drifting from the next row's beginning. The last
 * home is the current one by definition, and the list says so.
 *
 * The rows follow the panel's own rules: a name and a date share a two-column
 * grid on a phone and a row on a desktop, the actions are named buttons rather
 * than icon squares told apart by colour, and destructive is red at rest because
 * a phone has no hover.
 */

function ActionButton({
  tone,
  disabled,
  onClick,
  className,
  children
}: {
  tone: "primary" | "quiet" | "danger";
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={cn(
        "focus-ring inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-body font-medium transition-colors duration-200 ease-out disabled:opacity-40 sm:px-4",
        tone === "primary"
          ? "bg-accent text-text-primary hover:brightness-95"
          : tone === "danger"
            ? "border border-danger/30 bg-danger-soft/50 text-danger hover:bg-danger-soft"
            : "border border-border bg-surface text-text-secondary hover:bg-subtle hover:text-text-primary",
        className
      )}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function HomeForm({
  name,
  movedIn,
  onName,
  onMovedIn,
  onSave,
  onCancel,
  onDelete,
  saveLabel
}: {
  name: string;
  movedIn: string;
  onName: (value: string) => void;
  onMovedIn: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saveLabel: string;
}) {
  return (
    <div className="border-t border-border bg-subtle/40 px-3.5 py-3 sm:px-4">
      {/* A name can be long, so it takes the row; the date is the narrow one and
          follows. On a desktop they share a line. */}
      <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
        <FieldShell label="Address">
          <input
            className="focus-ring min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-label text-text-primary placeholder:text-text-tertiary transition duration-200 ease-in-out hover:border-border-emphasis"
            value={name}
            placeholder="Rudolph Apartments"
            onChange={(event) => onName(event.target.value)}
          />
        </FieldShell>
        <DateField label="Moved in" value={movedIn} dimFutureDates={false} onChange={onMovedIn} />
      </div>
      {/* Nothing the user must reach sits below the field they type in: on a
          phone the keyboard covers it. The actions are the last row here because
          the date trigger above them opens a picker rather than a keyboard. */}
      <div className="mt-2 flex items-center gap-1.5">
        {onDelete ? (
          <ActionButton tone="danger" onClick={onDelete} className="mr-auto">
            <Trash2 size={15} strokeWidth={1.8} />
            Delete
          </ActionButton>
        ) : null}
        <ActionButton tone="quiet" onClick={onCancel} className={onDelete ? "" : "ml-auto"}>
          Cancel
        </ActionButton>
        <ActionButton tone="primary" disabled={!name.trim()} onClick={onSave}>
          <Check size={16} strokeWidth={2} />
          {saveLabel}
        </ActionButton>
      </div>
    </div>
  );
}

export function HomesSection({
  homes,
  onAdd,
  onUpdate,
  onDelete
}: {
  homes: FinanceHome[];
  onAdd: (input: { name: string; movedIn: string }) => void;
  onUpdate: (input: { id: string; name: string; movedIn: string }) => void;
  onDelete: (home: FinanceHome) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [movedIn, setMovedIn] = useState(todayInputValue());

  // Newest first, because the current address is the one being looked for.
  const ordered = sortHomes(homes).reverse();

  function openAdd() {
    setEditing(null);
    setName("");
    setMovedIn(todayInputValue());
    setAdding(true);
  }

  function openEdit(home: FinanceHome) {
    setAdding(false);
    setName(home.name);
    setMovedIn(home.moved_in);
    setEditing(home.id);
  }

  function close() {
    setAdding(false);
    setEditing(null);
  }

  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      <div className="flex items-center gap-3 bg-subtle px-3.5 py-2.5 sm:px-4">
        <h3 className="min-w-0 flex-1 truncate text-subhead font-semibold tracking-[-0.01em] text-text-primary">
          Where you have lived
        </h3>
        <button
          className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface text-text-secondary transition-colors duration-200 ease-out hover:bg-subtle hover:text-text-primary"
          type="button"
          aria-label="Add a home"
          onClick={adding ? close : openAdd}
        >
          {adding ? <X size={17} strokeWidth={1.8} /> : <Plus size={17} strokeWidth={1.8} />}
        </button>
      </div>

      {adding ? (
        <HomeForm
          name={name}
          movedIn={movedIn}
          onName={setName}
          onMovedIn={setMovedIn}
          onSave={() => {
            onAdd({ name: name.trim(), movedIn });
            close();
          }}
          onCancel={close}
          saveLabel="Add home"
        />
      ) : null}

      {ordered.length === 0 && !adding ? (
        /* The one sentence in this panel that says something the numbers cannot:
           what the list is for, on a screen where it is empty and nothing else
           would explain why a chart range has nothing in it. */
        <p className="px-3.5 py-4 text-list text-text-secondary sm:px-4">
          Add each address and the day you moved in, and every bill can be read by where you were living when
          it arrived.
        </p>
      ) : null}

      {ordered.map((home, index) =>
        editing === home.id ? (
          <HomeForm
            key={home.id}
            name={name}
            movedIn={movedIn}
            onName={setName}
            onMovedIn={setMovedIn}
            onSave={() => {
              onUpdate({ id: home.id, name: name.trim(), movedIn });
              close();
            }}
            onCancel={close}
            onDelete={() => {
              onDelete(home);
              close();
            }}
            saveLabel="Save"
          />
        ) : (
          <button
            key={home.id}
            type="button"
            onClick={() => openEdit(home)}
            className="focus-ring flex min-h-11 w-full items-center gap-3 border-t border-border px-3.5 py-2 text-left transition-colors duration-200 ease-out hover:bg-subtle/60 sm:px-4"
          >
            <span className="min-w-0 flex-1 truncate text-label font-medium text-text-primary">
              {home.name}
            </span>
            {/* The current home is the last one by definition, so it is stated
                rather than stored — there is no flag that could go stale. */}
            {index === 0 ? (
              <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-caption font-medium text-text-primary">
                Now
              </span>
            ) : null}
            <span className="shrink-0 text-meta tabular-nums text-text-secondary">
              from {formatDateWithYear(home.moved_in)}
            </span>
          </button>
        )
      )}
    </section>
  );
}

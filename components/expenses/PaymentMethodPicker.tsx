"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  addPaymentCard,
  deletePaymentCard,
  loadPaymentCards,
  paymentOptions
} from "@/lib/paymentMethods";
import type { PaymentCard, PaymentMethod } from "@/types/expense";

/**
 * Choosing what paid for a transaction, from cards the user has saved.
 *
 * The old fixed three — Main card, Other card, Cash — meant every card past the
 * first was "Other", which is no use at tax time when the question is which
 * account a charge came out of. Cards are saved by nickname and reused; nothing
 * about the card itself is ever asked for, because nothing about it is needed.
 *
 * Removing one sits behind the pencil rather than on every chip: a stray tap in
 * the middle of logging a transaction should not be able to delete anything. It
 * takes no confirmation once you are in there — a deleted card takes no
 * transaction with it, and adding it back is a nickname and one tap.
 */
export function PaymentMethodPicker({
  value,
  userId,
  onChange
}: {
  value: PaymentMethod;
  userId: string;
  onChange: (method: PaymentMethod) => void;
}) {
  const [cards, setCards] = useState<PaymentCard[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    loadPaymentCards().then((list) => {
      if (live) setCards(list);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const options = paymentOptions(cards, value);
  const savedNicknames = new Set(cards.map((card) => card.nickname));

  async function handleAdd() {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const card = await addPaymentCard(userId, trimmed);
      setCards((current) => [...current, card]);
      onChange(card.nickname);
      setNickname("");
      setAdding(false);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "That card could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(card: PaymentCard) {
    setCards((current) => current.filter((item) => item.id !== card.id));
    setError("");
    try {
      await deletePaymentCard(card.id);
    } catch (deleteError) {
      setCards((current) => [...current, card]);
      setError(deleteError instanceof Error ? deleteError.message : "That card could not be removed.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((option) => {
          const card = cards.find((item) => item.nickname === option);
          const removable = editing && Boolean(card);

          return (
            <span key={option} className="relative">
              <button
                className={cn(
                  "focus-ring min-h-9 rounded-xl border px-3 text-[13.5px] font-medium transition duration-150 ease-out",
                  value === option
                    ? "border-accent bg-accent-soft text-text-primary"
                    : "border-border bg-subtle text-text-secondary hover:text-text-primary",
                  removable && "pr-7"
                )}
                type="button"
                aria-pressed={value === option}
                onClick={() => onChange(option)}
              >
                {option}
              </button>

              {removable ? (
                <button
                  className="focus-ring absolute right-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-border text-text-secondary transition hover:bg-danger-soft hover:text-danger"
                  type="button"
                  aria-label={`Remove ${option}`}
                  onClick={() => handleDelete(card as PaymentCard)}
                >
                  <X size={12} strokeWidth={2.4} />
                </button>
              ) : null}
            </span>
          );
        })}

        {adding ? (
          <span className="inline-flex items-center gap-1">
            <input
              ref={inputRef}
              className="focus-ring h-9 w-[136px] rounded-xl border border-border-emphasis bg-surface px-3 text-[13.5px] text-text-primary outline-none"
              value={nickname}
              placeholder="Card name"
              maxLength={40}
              disabled={saving}
              onChange={(event) => setNickname(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAdd();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setAdding(false);
                  setNickname("");
                }
              }}
            />
            <button
              className="focus-ring grid h-9 w-9 place-items-center rounded-xl bg-text-primary text-white transition hover:bg-[#2A2823]"
              type="button"
              disabled={saving}
              aria-label="Save card"
              onClick={handleAdd}
            >
              <Check size={15} strokeWidth={2.2} />
            </button>
          </span>
        ) : (
          <button
            className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-xl border border-dashed border-border-emphasis px-2.5 text-[13.5px] font-medium text-text-secondary transition hover:text-text-primary"
            type="button"
            onClick={() => {
              setAdding(true);
              setEditing(false);
              setError("");
            }}
          >
            <Plus size={14} strokeWidth={2} />
            Card
          </button>
        )}

        {cards.length > 0 && !adding ? (
          <button
            className={cn(
              "focus-ring grid h-9 w-9 place-items-center rounded-xl transition",
              editing ? "bg-text-primary text-white" : "text-text-tertiary hover:text-text-primary"
            )}
            type="button"
            aria-label={editing ? "Done removing cards" : "Remove cards"}
            aria-pressed={editing}
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? <Check size={15} strokeWidth={2.2} /> : <Pencil size={14} strokeWidth={1.9} />}
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-1.5 text-[12.5px] text-danger">{error}</p> : null}
    </div>
  );
}

"use client";

import { supabase } from "@/lib/supabase";
import type { PaymentCard, PaymentMethod } from "@/types/expense";

/**
 * The list of ways a transaction can have been paid.
 *
 * Cash is built in; everything else is a card the user saved, by nickname. No
 * card details are ever asked for or stored — the nickname is the whole record,
 * because its only job is to be recognisable in a picker.
 */

export const CASH: PaymentMethod = "Cash";

/** What a new transaction starts on before the user has saved any card. */
export const DEFAULT_PAYMENT_METHOD: PaymentMethod = "Main card";

/**
 * The three the app shipped with, before cards were the user's to name.
 *
 * Offered only while no card has been saved — which covers a brand new account
 * and, more importantly, the window before `supabase/payment-cards-schema.sql`
 * has been run, when the card list cannot load at all. Without this the picker
 * would be down to Cash in that window, which is worse than what it replaced.
 */
const LEGACY_METHODS: PaymentMethod[] = ["Main card", "Other card"];

/**
 * What the picker offers: Cash, the saved cards, and whatever this transaction
 * already says.
 *
 * The current value is always included even when it is not a saved card. An old
 * row can name a card that has since been deleted, and a picker that quietly
 * dropped it would show the transaction as paid some other way.
 */
export function paymentOptions(cards: PaymentCard[], current: PaymentMethod) {
  const options = [
    CASH,
    ...(cards.length > 0 ? cards.map((card) => card.nickname) : LEGACY_METHODS)
  ];
  if (current && !options.some((option) => option === current)) options.push(current);
  return options;
}

function requireClient() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

/**
 * Every card in the household, whoever added it.
 *
 * The books are shared, so a statement review can land on a charge made with
 * the other person's card — offering only your own would force you to file it
 * as Cash. The unique index is per user, so the same nickname can exist twice;
 * the first one added wins and the duplicate is dropped, because the picker
 * shows nicknames and two identical rows in it are unusable.
 */
export async function loadPaymentCards(): Promise<PaymentCard[]> {
  const { data, error } = await requireClient()
    .from("payment_cards")
    .select("*")
    .order("created_at", { ascending: true });

  // The table may not be migrated yet. Cash and the current value still work,
  // so this stays quiet rather than blocking the form behind a setup notice.
  if (error) return [];

  const seen = new Set<string>();
  return ((data ?? []) as PaymentCard[]).filter((card) => {
    const key = card.nickname.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function addPaymentCard(userId: string, nickname: string): Promise<PaymentCard> {
  const trimmed = nickname.trim();
  if (!trimmed) throw new Error("Give the card a name.");

  const { data, error } = await requireClient()
    .from("payment_cards")
    .insert({ user_id: userId, nickname: trimmed })
    .select("*")
    .single();

  if (error) {
    // The unique index is on the lowercased nickname, so this is the one error
    // worth naming: the user already has this card.
    if (error.code === "23505") throw new Error(`There is already a card called ${trimmed}.`);
    throw new Error(error.message || "That card could not be saved.");
  }

  return data as PaymentCard;
}

export async function deletePaymentCard(cardId: string) {
  const { error } = await requireClient().from("payment_cards").delete().eq("id", cardId);
  if (error) throw new Error(error.message || "That card could not be removed.");
}

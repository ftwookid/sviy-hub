import { clientTermsOn, selectedDaysLabel } from "@/lib/clients";
import { todayInputValue } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
import type { ClientPaymentMethod, ClientWithPets, PriceHistory } from "@/types/client";

/**
 * A client's terms — what a visit costs, how it is paid, which days — from a date.
 *
 * All three live on one `price_history` row, because they change together:
 * moving from Rover at $37 to Venmo at $35 is one event, and the 20% Rover takes
 * has to stop on the same day the price does. Every row is a whole snapshot, so
 * reading history back never has to stitch terms together from several rows. The client record keeps a copy of the
 * terms in force today, for the list and the card, and this is the only writer
 * that keeps the two in step.
 */
type ClientRecord = Pick<
  ClientWithPets,
  "id" | "price_per_visit" | "payment_method" | "frequency_label" | "visits_per_week"
>;

export type ClientTermInput = {
  client: ClientRecord;
  history: PriceHistory[];
  price: number;
  paymentMethod: ClientPaymentMethod;
  visitDays: string[];
  effectiveDate: string;
  /** The row being corrected, when this is an edit rather than a new change. */
  replaceId?: string | null;
  /**
   * The day the client started. When there is no dated history yet, the terms
   * the client had until now are written from here first — otherwise the only
   * row would be the new one, and every month before it would be re-priced at
   * the new terms.
   */
  openingDate?: string;
};

export async function writeClientTerm(input: ClientTermInput): Promise<{ error: string | null; history: PriceHistory[] }> {
  const { client, price, paymentMethod, visitDays, effectiveDate, replaceId, openingDate } = input;
  let history = input.history.slice();
  if (!supabase) return { error: "Supabase is not configured.", history };

  if (history.length === 0 && openingDate && openingDate < effectiveDate) {
    const opening = {
      client_id: client.id,
      price: Number(client.price_per_visit),
      payment_method: client.payment_method,
      visit_days: client.frequency_label || null,
      effective_date: openingDate
    };
    const { data, error } = await supabase.from("price_history").insert(opening).select("*").single();
    if (error) return { error: error.message, history };
    history = [...history, data as PriceHistory];
  }

  const payload = {
    client_id: client.id,
    price: Math.round(price * 100) / 100,
    payment_method: paymentMethod,
    visit_days: selectedDaysLabel(visitDays),
    effective_date: effectiveDate
  };

  const sameDay = history.find((entry) => entry.effective_date === effectiveDate && entry.id !== replaceId);
  const targetId = sameDay?.id ?? replaceId ?? null;

  const { data: saved, error: saveError } = targetId
    ? await supabase.from("price_history").update(payload).eq("id", targetId).select("*").single()
    : await supabase.from("price_history").insert(payload).select("*").single();
  if (saveError) return { error: saveError.message, history };

  history = history.filter((entry) => entry.id !== targetId);
  if (sameDay && replaceId) {
    // Moved onto a date that already had terms: the two merge into one row.
    const { error: deleteError } = await supabase.from("price_history").delete().eq("id", replaceId);
    if (deleteError) return { error: deleteError.message, history };
    history = history.filter((entry) => entry.id !== replaceId);
  }
  history = [...history, saved as PriceHistory];

  const syncError = await syncClientTerms(client, history);
  return { error: syncError, history };
}

export async function deleteClientTerm(
  client: ClientRecord,
  history: PriceHistory[],
  entryId: string
) {
  if (!supabase) return "Supabase is not configured.";
  const { error } = await supabase.from("price_history").delete().eq("id", entryId);
  if (error) return error.message;
  return syncClientTerms(
    client,
    history.filter((entry) => entry.id !== entryId)
  );
}

/** Copies the terms in force today onto the client record. */
async function syncClientTerms(
  client: ClientRecord,
  history: PriceHistory[]
) {
  if (!supabase) return null;
  const today = todayInputValue();
  const terms = clientTermsOn({ ...client, price_history: history }, today);
  const { error } = await supabase
    .from("clients")
    .update({
      price_per_visit: Math.round(terms.price * 100) / 100,
      payment_method: terms.paymentMethod,
      frequency_label: selectedDaysLabel(terms.days),
      visits_per_week: terms.visitsPerWeek,
      updated_at: new Date().toISOString()
    })
    .eq("id", client.id);
  return error?.message ?? null;
}

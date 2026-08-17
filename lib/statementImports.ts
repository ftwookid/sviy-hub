import { SCHEDULE_C_CATEGORIES } from "@/lib/categories";
import { parseLocalDate, toInputDate } from "@/lib/formatters";
import type {
  MerchantRule,
  RowDecision,
  StatementImportRow,
  StatementReconciliation
} from "@/types/statementImport";

/** What a row falls back to when nothing has taught us better. */
export const DEFAULT_IMPORT_CATEGORY = "Other Expense";

export const DECISION_HINTS: Record<RowDecision, string> = {
  Include: "Becomes a transaction in your books.",
  Flag: "Kept here for later — nothing is written to your books yet.",
  Exclude: "Left out, and remembered so it is skipped next time."
};

/**
 * Noise that appears around a merchant name on card statements but says nothing
 * about who was paid. Stripped before fingerprinting so the same shop matches
 * itself across months.
 */
const DESCRIPTOR_NOISE = [
  "POS",
  "PURCHASE",
  "DEBIT",
  "CREDIT",
  "CARD",
  "VISA",
  "MASTERCARD",
  "RECURRING",
  "PAYMENT",
  "AUTOPAY",
  "ACH",
  "WEB",
  "ID",
  "REF",
  "TST",
  "SQ",
  "PP",
  "PAYPAL",
  "XXXX",
  "USA",
  "US"
];

/**
 * Collapses a statement descriptor to a stable fingerprint.
 *
 * The goal is that "SQ *CHEWY.COM 4417 NY" and "SQ *CHEWY.COM 9902 NY" produce
 * the same key, so a decision made once carries forward. Deliberately crude and
 * deterministic — a fingerprint that is occasionally too broad just means the
 * user re-picks a category, while one that drifts would silently mis-categorize.
 */
export function merchantMatchKey(descriptor: string) {
  const cleaned = descriptor
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    // Anything with three or more digits is a store, card, or reference number.
    .replace(/\b[A-Z]*\d{3,}[A-Z0-9]*\b/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !DESCRIPTOR_NOISE.includes(token))
    .slice(0, 4)
    .join(" ")
    .trim();

  // Everything was noise — fall back to the raw descriptor so unrelated rows
  // never collapse into one empty-key rule.
  return cleaned || descriptor.toUpperCase().replace(/\s+/g, " ").trim();
}

/** Title-cases the fingerprint so an unnamed row still reads like a merchant. */
export function merchantFromDescriptor(descriptor: string) {
  const key = merchantMatchKey(descriptor);
  return key
    .split(" ")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

export function isKnownCategory(category: string | null | undefined) {
  return Boolean(category) && SCHEDULE_C_CATEGORIES.includes(category as never);
}

export function rulesByKey(rules: MerchantRule[]) {
  const map = new Map<string, MerchantRule>();
  rules.forEach((rule) => map.set(rule.match_key, rule));
  return map;
}

export function rowTotal(rows: Pick<StatementImportRow, "amount">[]) {
  return rows.reduce((total, row) => total + Number(row.amount), 0);
}

export function decisionCounts(rows: Pick<StatementImportRow, "decision">[]) {
  return {
    include: rows.filter((row) => row.decision === "Include").length,
    flag: rows.filter((row) => row.decision === "Flag").length,
    exclude: rows.filter((row) => row.decision === "Exclude").length
  };
}

/** Rows that cannot be written to the books yet, with the reason why. */
export function rowBlockers(row: StatementImportRow): string[] {
  if (row.decision !== "Include") return [];
  const blockers: string[] = [];
  if (!row.date) blockers.push("Needs a date");
  if (!row.merchant.trim()) blockers.push("Needs a merchant");
  if (!(Number(row.amount) > 0)) blockers.push("Needs an amount over $0");
  if (!row.category) blockers.push("Needs a category");
  return blockers;
}

/** First of the month a statement mostly covers, used as the default filing month. */
export function inferPeriodMonth(periodEnd: string | null, dates: string[]) {
  if (periodEnd) {
    const end = parseLocalDate(periodEnd);
    return toInputDate(new Date(end.getFullYear(), end.getMonth(), 1));
  }

  const tally = new Map<string, number>();
  dates.forEach((value) => {
    if (!value) return;
    const month = value.slice(0, 7);
    tally.set(month, (tally.get(month) ?? 0) + 1);
  });

  const winner = Array.from(tally.entries()).sort((a, b) => b[1] - a[1])[0];
  return winner ? `${winner[0]}-01` : null;
}

const CENT_TOLERANCE = 0.02;

export function reconcile({
  statedTotalDebits,
  statedTotalCredits,
  transactions,
  auditAdjusted,
  notes
}: {
  statedTotalDebits: number;
  statedTotalCredits: number;
  transactions: { amount: number; direction: "Debit" | "Credit" }[];
  auditAdjusted: boolean;
  notes: string;
}): StatementReconciliation {
  const sum = (direction: "Debit" | "Credit") =>
    Number(
      transactions
        .filter((row) => row.direction === direction)
        .reduce((total, row) => total + Number(row.amount), 0)
        .toFixed(2)
    );

  const extractedTotalDebits = sum("Debit");
  const extractedTotalCredits = sum("Credit");

  // The model reports -1 when the statement prints no such total. With nothing
  // to check against, `balanced` stays null rather than claiming a clean bill.
  const stated = statedTotalDebits >= 0 ? statedTotalDebits : null;
  const statedCredits = statedTotalCredits >= 0 ? statedTotalCredits : null;

  const balanced =
    stated === null ? null : Math.abs(stated - extractedTotalDebits) <= CENT_TOLERANCE;

  return {
    statedTotalDebits: stated,
    statedTotalCredits: statedCredits,
    extractedTotalDebits,
    extractedTotalCredits,
    balanced,
    auditAdjusted,
    notes
  };
}

export function reconciliationOf(
  value: StatementReconciliation | Record<string, never> | null
): StatementReconciliation | null {
  if (!value || typeof value !== "object" || !("extractedTotalDebits" in value)) return null;
  return value as StatementReconciliation;
}

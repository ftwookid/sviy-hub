import { DEFAULT_CATEGORY, isKnownCategory as isCurrentCategory } from "@/lib/categories";
import { parseLocalDate, toInputDate } from "@/lib/formatters";
import type {
  MerchantRule,
  RowDecision,
  StatementImportRow,
  StatementReconciliation
} from "@/types/statementImport";

/** What a row falls back to when nothing has taught us better. */
export const DEFAULT_IMPORT_CATEGORY = DEFAULT_CATEGORY;

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

/** The text a row should be fingerprinted on — the raw descriptor when it has one. */
function descriptorOf(row: Pick<StatementImportRow, "description" | "merchant">) {
  return (row.description || row.merchant || "").trim();
}

/**
 * True when two fingerprints describe the same payee.
 *
 * Identical is the normal case. The subset arm is for the descriptors banks
 * write on a return, which carry the charge's words plus one of their own —
 * "CHEWY COM FL" against "CHEWY COM RETURN FL", where a plain prefix test
 * fails because the extra word lands in the middle. The smaller side has to
 * contribute a real word, so a key that survived fingerprinting as one short
 * token never sweeps up unrelated rows.
 */
function keysRelated(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;

  const [small, large] =
    a.length <= b.length ? [a.split(" "), b.split(" ")] : [b.split(" "), a.split(" ")];

  if (!small.some((token) => token.length >= 3)) return false;

  const big = new Set(large);
  return small.every((token) => big.has(token));
}

/**
 * Other rows on the same statement that came from the same payee.
 *
 * Used to offer "the other five Chewy charges too?" after a single category
 * edit. Rows already written to the books are left out — their category lives
 * on the expense now, and changing it here would not follow.
 */
export function similarRows<T extends Pick<StatementImportRow, "id" | "description" | "merchant" | "expense_id">>(
  target: T,
  rows: T[]
): T[] {
  const key = merchantMatchKey(descriptorOf(target));
  if (!key) return [];
  return rows.filter(
    (row) => row.id !== target.id && !row.expense_id && merchantMatchKey(descriptorOf(row)) === key
  );
}

type PairableRow = Pick<
  StatementImportRow,
  "date" | "amount" | "direction" | "description" | "merchant"
>;

/** A refund can post weeks after the charge, but not across an unrelated quarter. */
const REFUND_MAX_DAYS = 120;

function daysApart(a: string, b: string) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const gap = parseLocalDate(a).getTime() - parseLocalDate(b).getTime();
  return Math.abs(gap) / 86_400_000;
}

/**
 * Charges that were handed straight back, as `[chargeIndex, creditIndex]` pairs.
 *
 * A charge and a same-amount credit from the same payee is a cancelled order or
 * a returned item: the money never left, so neither side is a business expense
 * and counting only the debit would overstate the deduction. Matching needs the
 * amount *and* the payee to agree — amount alone would pair a $40 refund with
 * whichever unrelated $40 charge happened to be nearest.
 *
 * Greedy, nearest-in-time first, and each charge is claimed once, so a month
 * with three identical charges and one refund retires exactly one of them.
 */
export function refundPairIndexes(rows: PairableRow[]): [number, number][] {
  const cents = (value: number) => Math.round(Number(value) * 100);

  const debits = rows
    .map((row, index) => ({ row, index }))
    .filter((entry) => entry.row.direction === "Debit");

  const claimed = new Set<number>();
  const pairs: [number, number][] = [];

  rows.forEach((credit, creditIndex) => {
    if (credit.direction !== "Credit") return;
    const key = merchantMatchKey(descriptorOf(credit));
    const amount = cents(credit.amount);

    const match = debits
      .filter(
        ({ row, index }) =>
          !claimed.has(index) &&
          cents(row.amount) === amount &&
          keysRelated(key, merchantMatchKey(descriptorOf(row))) &&
          daysApart(row.date, credit.date) <= REFUND_MAX_DAYS
      )
      .sort(
        (a, b) => daysApart(a.row.date, credit.date) - daysApart(b.row.date, credit.date)
      )[0];

    if (match) {
      claimed.add(match.index);
      pairs.push([match.index, creditIndex]);
    }
  });

  return pairs;
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
  return isCurrentCategory(category);
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

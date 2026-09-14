import { EDITABLE_BUCKETS, currentAmount, currentCadence, endedOn } from "@/lib/finances";
import { billFor, monthValue, periodMonthOf } from "@/lib/utilities";
import { shiftPeriodMonth } from "@/lib/expenses";
import type { FinanceBucket, FinanceLine } from "@/types/finance";
import type { UtilityAccountBills, UtilityBook } from "@/types/utility";

/**
 * Everything the household types in, as one list.
 *
 * Finances had two front doors — Setup for the standing figures and Utilities
 * for the metered bills — and which door a thing lived behind was decided by how
 * the app stores it, not by anything the person typing it knows. Rent and water
 * are the same kind of fact: a commitment that arrives every month whether or
 * not anybody thinks about it. Asking somebody to remember that one is a
 * "standing figure" and the other is a "utility account" is asking them to hold
 * the schema in their head.
 *
 * So there is one list, and the distinction that survives is the one a person
 * can actually answer: **is the amount the same every month, or does it move?**
 * `fixed` is a dated schedule (rent, a paycheck, Spotify). `varies` is a bill
 * per month (water, power, gas). That question is asked once, when the thing is
 * added, and it is the only thing that changes about the editor afterwards.
 *
 * Nothing here queries and nothing is stored differently: a `fixed` entry is a
 * `finance_lines` row and a `varies` entry is a `utility_accounts` row, exactly
 * as before. This file is the view that puts them in one place.
 */

export type EntryKind = "fixed" | "varies";

export type ManagedEntry = {
  /** Unique across both kinds, so one selection can address either. */
  key: string;
  id: string;
  kind: EntryKind;
  bucket: FinanceBucket;
  label: string;
  /** What it is worth a month right now, or null when nothing has been typed yet. */
  amount: number | null;
  /**
   * The one word beside the figure: `avg` where a cadence makes the monthly
   * figure an average, `est` where a month has no bill and is carrying the
   * average of the last three, `Ended` where the line has stopped.
   */
  tag: "avg" | "est" | "ended" | null;
  line?: FinanceLine;
  utility?: UtilityAccountBills;
};

function fixedEntry(line: FinanceLine): ManagedEntry {
  const stopped = endedOn(line.rates);
  const cadence = currentCadence(line.rates);
  return {
    key: `fixed:${line.id}`,
    id: line.id,
    kind: "fixed",
    bucket: line.bucket,
    label: line.label,
    amount: line.rates.length === 0 ? null : currentAmount(line.rates),
    tag: stopped ? "ended" : cadence === "Monthly" ? null : "avg",
    line
  };
}

function variesEntry(entry: UtilityAccountBills, periodMonth: string): ManagedEntry {
  const value = monthValue(entry.bills, periodMonth);
  return {
    key: `varies:${entry.account.id}`,
    id: entry.account.id,
    kind: "varies",
    bucket: entry.account.bucket,
    label: entry.account.name,
    amount: value.basis === "none" ? null : value.amount,
    tag: value.basis === "estimate" ? "est" : null,
    utility: entry
  };
}

/** Every typed figure, both kinds, in one array. */
export function managedEntries(lines: FinanceLine[], book: UtilityBook, periodMonth: string): ManagedEntry[] {
  return [
    ...lines.map(fixedEntry),
    ...book.map((entry) => variesEntry(entry, periodMonth))
  ];
}

export type EntryGroup = { bucket: FinanceBucket; entries: ManagedEntry[]; total: number };

/**
 * The list, by bucket, in the order the month reads.
 *
 * An empty bucket is kept: it is where a new line of that kind goes, and a
 * bucket that disappears when it empties is one the reader cannot find again.
 * A bucket emptied by a search is dropped, because there the absence is the
 * answer.
 */
export function groupEntries(entries: ManagedEntry[], dropEmpty = false): EntryGroup[] {
  return EDITABLE_BUCKETS.map((bucket) => {
    const inBucket = entries.filter((entry) => entry.bucket === bucket);
    return {
      bucket,
      entries: inBucket,
      total: inBucket.reduce((sum, entry) => sum + (entry.amount ?? 0), 0)
    };
  }).filter((group) => !dropEmpty || group.entries.length > 0);
}

/** Case- and space-insensitive name match. One field, both kinds, no filter row. */
export function searchEntries(entries: ManagedEntry[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) => entry.label.toLowerCase().includes(needle));
}

/** A bill that has not been typed yet: which account, and which month is missing. */
export type PendingBill = { entry: ManagedEntry; periodMonth: string };

/** How far back an unentered bill is still worth chasing on the list. */
const PENDING_WINDOW = 3;

/**
 * The bills that are waiting to be typed — the single most frequent job here.
 *
 * A metered account with history and no bill for this month is the one thing
 * this screen can know needs doing, and before this it was invisible: the water
 * bill arrived, and finding where to put it meant a panel, a row, a year grid
 * and a month cell. Surfaced here it is the first thing on the page.
 *
 * Only accounts that have been billed before are chased. An account added
 * yesterday is not overdue, and an empty one has nothing to be measured against.
 * The **oldest** gap in the window is the one named, because that is the one
 * most overdue; entering it reveals the next.
 */
export function pendingBills(entries: ManagedEntry[], periodMonth: string): PendingBill[] {
  const pending: PendingBill[] = [];

  entries.forEach((entry) => {
    const bills = entry.utility?.bills;
    if (!bills || bills.length === 0) return;

    const firstBilled = bills[0].period_month;
    // Oldest first, so the gap that has been waiting longest is the one named.
    for (let back = PENDING_WINDOW - 1; back >= 0; back -= 1) {
      const month = shiftPeriodMonth(periodMonth, -back);
      if (month < firstBilled) continue;
      if (billFor(bills, month)) continue;
      pending.push({ entry, periodMonth: month });
      return;
    }
  });

  return pending;
}

/** The years a metered account can be opened at — ten back, always reachable. */
const BACKFILL_YEARS = 10;

export function billYearRange(entry: UtilityAccountBills, pageYear: number) {
  const { bills } = entry;
  const firstYear = bills.length > 0 ? Number(bills[0].period_month.slice(0, 4)) : pageYear;
  const lastYear = bills.length > 0 ? Number(bills[bills.length - 1].period_month.slice(0, 4)) : pageYear;
  return {
    minYear: Math.min(firstYear, pageYear - BACKFILL_YEARS),
    maxYear: Math.max(lastYear, pageYear)
  };
}

/** How many bills each year holds — "is there anything in 2024?", answered in the picker. */
export function billsPerYear(entry: UtilityAccountBills) {
  const counts = new Map<number, number>();
  entry.bills.forEach((bill) => {
    const year = Number(bill.period_month.slice(0, 4));
    counts.set(year, (counts.get(year) ?? 0) + 1);
  });
  return counts;
}

export { periodMonthOf };

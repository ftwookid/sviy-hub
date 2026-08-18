import { parseLocalDate, toInputDate } from "@/lib/formatters";
import type { SheetGrid } from "@/lib/spreadsheet";
import type {
  ProofSheetExpense,
  ProofSheetLine,
  ProofSheetMatch,
  SheetColumnMap
} from "@/types/proofSheet";

/**
 * Turning a vendor report into proof for the transactions it covers.
 *
 * Two rules decide a match, and both are arithmetic rather than judgement:
 * the amounts agree to the cent, and the dates are close enough to be the same
 * event. Nothing here asks a model what it thinks, because a wrong match is a
 * receipt attached to a transaction it does not prove — the exact thing an
 * audit is looking for.
 *
 * A card settles a day or two after the charge, and a weekend charge can post on
 * the Monday, so the window runs forward from the report's date. It also runs
 * back a little: some vendors report the settlement date, not the swipe.
 */

const EARLIEST_DAY_GAP = -2;
const LATEST_DAY_GAP = 6;

/** Money compares to the cent — never with `===` on two floats. */
function sameAmount(a: number, b: number) {
  return Math.abs(a - b) < 0.005;
}

function dayGap(fromIso: string, toIso: string) {
  return Math.round(
    (parseLocalDate(toIso).getTime() - parseLocalDate(fromIso).getTime()) / 86_400_000
  );
}

/**
 * A date cell as an ISO date, whatever the vendor's export felt like printing.
 *
 * Covers the three shapes these reports actually use: ISO, US month-first, and
 * a date with a time hanging off it ("1/30/26, 4:12 PM"). Excel serials are
 * already ISO by the time they get here — see lib/spreadsheet.ts.
 */
export function parseSheetDate(value: string): string | null {
  const text = (value || "").trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    const year = Number(us[3]) < 100 ? 2000 + Number(us[3]) : Number(us[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return toInputDate(new Date(year, month - 1, day));
  }

  // "January 30, 2026" and friends. Parsed as noon so a timezone shift cannot
  // slide the date onto the day before.
  const parsed = new Date(`${text} 12:00`);
  return Number.isNaN(parsed.getTime()) ? null : toInputDate(parsed);
}

/** "$2.10", "2.10", "(2.10)" and "-2.10" all mean the same charge. */
export function parseSheetAmount(value: string): number | null {
  const text = (value || "").trim();
  if (!text) return null;

  const digits = text.replace(/[^0-9.-]/g, "");
  if (!digits || !/\d/.test(digits)) return null;

  const amount = Math.abs(Number(digits));
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : null;
}

/**
 * Reads every charge out of the grid using the column map.
 *
 * The model chose the columns; the values themselves are read straight from the
 * file. That split is the point — a transcription slip on an amount would put
 * proof against the wrong transaction, and this way the amounts the matcher
 * sees are the ones the vendor printed.
 */
export function linesFromGrid(grid: SheetGrid, map: SheetColumnMap): ProofSheetLine[] {
  const lines: ProofSheetLine[] = [];
  const startRow = Math.max(0, map.firstDataRow);

  for (let row = startRow; row < grid.rows.length; row += 1) {
    const cells = grid.rows[row] ?? [];
    const date = parseSheetDate(cells[map.dateColumn] ?? "");
    const amount = parseSheetAmount(cells[map.amountColumn] ?? "");

    // Totals rows, blank separators, and repeated headers all fail one of these.
    if (!date || amount === null || amount === 0) continue;

    const description = map.descriptionColumns
      .map((column) => (cells[column] ?? "").trim())
      .filter(Boolean)
      .join(" · ");

    lines.push({ row: row + 1, date, amount, description });
  }

  return lines;
}

/**
 * Pairs report lines with transactions, one to one.
 *
 * Fifty parking charges in a month are mostly the same handful of amounts, so
 * candidate pairs are ranked by how close the dates are and claimed in that
 * order. Each line proves at most one transaction and each transaction is
 * claimed once, which keeps three identical $2.10 charges from all matching the
 * single row that happens to sit nearest.
 */
export function matchProofLines(
  lines: ProofSheetLine[],
  expenses: ProofSheetExpense[]
): ProofSheetMatch[] {
  const pairs: { line: ProofSheetLine; expense: ProofSheetExpense; gap: number }[] = [];

  lines.forEach((line) => {
    expenses.forEach((expense) => {
      if (!sameAmount(line.amount, Number(expense.amount))) return;
      const gap = dayGap(line.date, expense.date);
      if (gap < EARLIEST_DAY_GAP || gap > LATEST_DAY_GAP) return;
      pairs.push({ line, expense, gap });
    });
  });

  // Closest dates first, and among equals the earlier line, so the order a
  // report is read in does not change which transactions it ends up proving.
  pairs.sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap) || a.line.row - b.line.row);

  const claimedLines = new Set<number>();
  const claimedExpenses = new Set<string>();
  const matches: ProofSheetMatch[] = [];

  pairs.forEach((pair) => {
    if (claimedLines.has(pair.line.row) || claimedExpenses.has(pair.expense.id)) return;
    claimedLines.add(pair.line.row);
    claimedExpenses.add(pair.expense.id);
    matches.push({ line: pair.line, expense: pair.expense, dayGap: pair.gap });
  });

  return matches.sort((a, b) => a.expense.date.localeCompare(b.expense.date));
}

/** The window of transactions a report could possibly cover. */
export function candidateDateRange(lines: ProofSheetLine[]) {
  const dates = lines.map((line) => line.date).sort();
  if (dates.length === 0) return null;

  const shift = (iso: string, days: number) => {
    const date = parseLocalDate(iso);
    return toInputDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
  };

  return { start: shift(dates[0], EARLIEST_DAY_GAP), end: shift(dates[dates.length - 1], LATEST_DAY_GAP) };
}

/** The month a report files under: the one most of its charges fall in. */
export function reportPeriodDate(matches: ProofSheetMatch[], lines: ProofSheetLine[]) {
  const dates = (matches.length > 0 ? matches.map((match) => match.expense.date) : lines.map((line) => line.date))
    .slice()
    .sort();
  return dates[Math.floor(dates.length / 2)] ?? null;
}

import { periodMonthShortLabel } from "@/lib/expenses";
import { toPeriodMonth } from "@/lib/utilities";
import type { FinanceHistoryPoint, FinanceHome } from "@/types/finance";

/**
 * A figure read by the address it was paid at.
 *
 * Pure, like the rest of the Finances arithmetic. The question it exists for is
 * the one a move actually raises — **is it more expensive to live here than it
 * was at the last place?** — and that is not a question a line chart answers on
 * its own: two years of electricity going up and down says nothing until the
 * months are grouped by which home they were paid at and each group is averaged.
 *
 * So the chart's middle range is not a different *span*, it is a different
 * *reading*: the same history, cut at each move, with an average against each
 * home and the difference between consecutive ones stated as a figure. The line
 * is still there behind it, because seasonality is the first thing anybody would
 * accuse the comparison of.
 */

/** Homes oldest first — the order every reader below assumes. */
export function sortHomes(homes: FinanceHome[]) {
  return [...homes].sort((a, b) => a.moved_in.localeCompare(b.moved_in));
}

/**
 * The home a month belongs to.
 *
 * The month is attributed to the home that had been moved into by the time it
 * **ended**, so a move on the 20th gives that whole month to the new address.
 * A month can straddle a move and a bill cannot be split across one — it arrives
 * once, from whichever supplier was serving at the end of it.
 */
export function homeForMonth(homes: FinanceHome[], periodMonth: string) {
  const ordered = sortHomes(homes);
  let current: FinanceHome | null = null;
  ordered.forEach((home) => {
    if (toPeriodMonth(home.moved_in) <= periodMonth) current = home;
  });
  return current;
}

/** What one home's months came to. */
export type HomeSpell = {
  home: FinanceHome;
  points: FinanceHistoryPoint[];
  /** Per month at this address. The comparable figure — a home lived in for three months is not cheaper for it. */
  average: number;
  /** The first and last month with a figure, for the caption under the name. */
  from: string;
  to: string;
  /** Fractional change against the home before it, or null for the first one. */
  change: number | null;
};

/**
 * The history cut at each move.
 *
 * Months before the first home are **dropped rather than pooled**: they were
 * paid somewhere, and calling that somewhere "unknown" and averaging it would
 * invent a fourth address to compare against. A home with no months in the
 * series is dropped too — a comparison needs something on both sides of it.
 */
export function homeSpells(points: FinanceHistoryPoint[], homes: FinanceHome[]): HomeSpell[] {
  const ordered = sortHomes(homes);
  if (ordered.length === 0 || points.length === 0) return [];

  const spells = ordered
    .map((home, index) => {
      const from = toPeriodMonth(home.moved_in);
      const next = ordered[index + 1];
      const until = next ? toPeriodMonth(next.moved_in) : null;
      const inside = points.filter(
        (point) => point.periodMonth >= from && (until === null || point.periodMonth < until)
      );
      if (inside.length === 0) return null;

      const total = inside.reduce((sum, point) => sum + point.amount, 0);
      return {
        home,
        points: inside,
        average: Math.round((total / inside.length) * 100) / 100,
        from: inside[0].periodMonth,
        to: inside[inside.length - 1].periodMonth,
        change: null as number | null
      };
    })
    .filter((spell): spell is HomeSpell => spell !== null);

  // Each home against the one before it — the comparison a move actually
  // prompts. Against the *first* home instead would answer a question nobody
  // asks after the second move.
  return spells.map((spell, index) => {
    const previous = spells[index - 1];
    return {
      ...spell,
      change: previous && previous.average > 0 ? spell.average / previous.average - 1 : null
    };
  });
}

/** "Mar 2025 – Aug 2026", or one month named once. */
export function spellRangeLabel(spell: HomeSpell) {
  const from = periodMonthShortLabel(spell.from);
  const to = periodMonthShortLabel(spell.to);
  return from === to ? from : `${from} – ${to}`;
}

/** How many months of this home the series actually holds. */
export function spellMonths(spell: HomeSpell) {
  return spell.points.length;
}

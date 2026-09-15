"use client";

import { ChevronRight, Home, Search, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { EntryTag } from "@/components/finances/manage/controls";
import { SECTION_STYLE } from "@/lib/finances";
import { groupEntries, searchEntries } from "@/lib/financeEntries";
import { periodMonthShortLabel } from "@/lib/expenses";
import { MONTHS } from "@/lib/months";
import { formatCurrency } from "@/lib/formatters";
import type { ManagedEntry, PendingBill } from "@/lib/financeEntries";

/**
 * Everything typed into Finances, as one list.
 *
 * The two panels this replaces were split by storage, not by anything a person
 * knows: rent lived behind Setup and the water bill behind Utilities, and to
 * find either you had to have guessed right before you opened anything. One
 * list, grouped by the same blocks the month reads in, means there is nothing
 * to guess — the thing you are looking for is on this screen or it does not
 * exist, and the search field settles it either way.
 *
 * The bucket groups are strips inside **one** card rather than seven cards: a
 * card each would be seven borders, seven shadows and fourteen paddings for a
 * screen whose content is a column of names and figures.
 */

/**
 * The bills that are waiting to be typed — first thing on the screen.
 *
 * This is the job this section exists for and it was the one thing the old
 * layout could not tell you. A water bill arrived; finding where to put it meant
 * a panel, a row, a year grid and a month cell, and nothing anywhere said it was
 * outstanding. Here it is a chip, and tapping it lands on that month with the
 * field already focused.
 *
 * It is not rendered when there is nothing waiting — a reserved-but-empty row is
 * height spent on saying nothing.
 */
/**
 * Which month is outstanding — the year only where it is not this one.
 *
 * Every chip here is within three months of now, so "Aug 2026" on a screen
 * rendered in September 2026 prints a year nobody was in any doubt about, and
 * three chips that would have fitted one row wrap onto two. The year comes back
 * the moment it earns its place, which is a December bill still open in January.
 */
function pendingMonthLabel(periodMonth: string, nowYear: number) {
  const year = Number(periodMonth.slice(0, 4));
  const monthIndex = Number(periodMonth.slice(5, 7)) - 1;
  const short = MONTHS[monthIndex]?.slice(0, 3) ?? periodMonthShortLabel(periodMonth);
  // The clock is never read here: the screen's own month is what "now" means,
  // so the same list renders identically on the server and in the browser.
  return year === nowYear ? short : `${short} ${year}`;
}

function WaitingStrip({
  pending,
  nowYear,
  onOpen
}: {
  pending: PendingBill[];
  nowYear: number;
  onOpen: (entry: ManagedEntry, periodMonth: string) => void;
}) {
  if (pending.length === 0) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-[20px] border border-accent/40 bg-accent-soft/40">
      <div className="flex items-center gap-2 px-3.5 pb-1.5 pt-2.5 sm:px-4">
        <h2 className="min-w-0 flex-1 truncate text-label font-semibold tracking-[-0.01em] text-text-primary">
          {pending.length === 1 ? "1 bill to enter" : `${pending.length} bills to enter`}
        </h2>
      </div>
      <div className="flex flex-wrap gap-1.5 px-3.5 pb-3 sm:px-4">
        {pending.map(({ entry, periodMonth }) => (
          <button
            key={`${entry.key}:${periodMonth}`}
            className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-label text-text-primary transition-colors duration-200 ease-out hover:bg-subtle"
            type="button"
            onClick={() => onOpen(entry, periodMonth)}
          >
            <span className="truncate">{entry.label}</span>
            <span className="shrink-0 text-meta text-text-tertiary">{pendingMonthLabel(periodMonth, nowYear)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function EntryList({
  entries,
  pending,
  nowYear,
  query,
  selectedKey,
  homeCount,
  homesSelected,
  onQuery,
  onSelect,
  onOpenBill,
  onSelectHomes
}: {
  entries: ManagedEntry[];
  pending: PendingBill[];
  /** The year the screen calls "now" — never the clock, so SSR and the browser agree. */
  nowYear: number;
  query: string;
  selectedKey: string | null;
  homeCount: number;
  homesSelected: boolean;
  onQuery: (next: string) => void;
  onSelect: (entry: ManagedEntry) => void;
  onOpenBill: (entry: ManagedEntry, periodMonth: string) => void;
  onSelectHomes: () => void;
}) {
  const searching = query.trim().length > 0;
  const visible = searchEntries(entries, query);
  // An empty bucket is kept while browsing — it is where a new line of that kind
  // goes, and a bucket that vanishes when it empties is one the reader cannot
  // find again. Under a search it is dropped, because there the absence is the
  // answer.
  const groups = groupEntries(visible, searching);

  return (
    <div>
      {/* The bills waiting to be typed come before the search field, because
          that is the order the jobs actually happen in: nine visits in ten
          start with a bill in hand, and searching is for the tenth — finding a
          line to correct. Putting the field first pushed the one thing this
          screen can know needs doing 60px down the page for nothing. */}
      {searching ? null : <WaitingStrip pending={pending} nowYear={nowYear} onOpen={onOpenBill} />}

      {/* One field, not a row of filter tabs. Everything is on this screen, so
          the only navigation it needs is narrowing — and a segmented row for
          seven buckets would be 48px charged to every visit. */}
      <div className="relative mb-3">
        <Search
          size={16}
          strokeWidth={1.8}
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <input
          className="focus-ring min-h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-10 text-label text-text-primary placeholder:text-text-tertiary"
          value={query}
          type="search"
          aria-label="Search everything you have entered"
          placeholder="Search"
          onChange={(event) => onQuery(event.target.value)}
        />
        {searching ? (
          <button
            className="focus-ring absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl text-text-tertiary transition-colors duration-200 ease-out hover:text-text-primary"
            type="button"
            aria-label="Clear the search"
            onClick={() => onQuery("")}
          >
            <X size={16} strokeWidth={1.9} />
          </button>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <p className="rounded-[20px] border border-border bg-surface px-3.5 py-4 text-list text-text-secondary shadow-card sm:px-4">
          Nothing matches “{query.trim()}”.
        </p>
      ) : (
        <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
          {groups.map((group, index) => {
            const style = SECTION_STYLE[group.bucket];
            return (
              <div key={group.bucket} className={cn(index > 0 && "border-t border-border")}>
                <div className="flex items-center gap-2.5 bg-[#F4F2EC] px-3.5 py-2 sm:px-4">
                  <span aria-hidden className={cn("h-4 w-1.5 shrink-0 rounded-full", style.color)} />
                  <h2 className="min-w-0 flex-1 truncate text-label font-semibold tracking-[-0.01em] text-text-primary">
                    {style.title}
                  </h2>
                  {/* An empty bucket gets no total: $0.00 is a zero pretending to
                      be a figure, and the absence of rows already says it. */}
                  {group.entries.length > 0 ? (
                    <span className="shrink-0 text-label font-medium tabular-nums text-text-primary">
                      {formatCurrency(group.total)}
                    </span>
                  ) : (
                    <span className="shrink-0 text-label text-text-tertiary">—</span>
                  )}
                </div>

                <div className="divide-y divide-border/60">
                  {group.entries.map((entry) => {
                    const selected = entry.key === selectedKey;
                    return (
                      <button
                        key={entry.key}
                        className={cn(
                          "focus-ring flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors duration-200 ease-out sm:px-4",
                          selected ? "bg-accent-soft/50" : "hover:bg-subtle/60"
                        )}
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        onClick={() => onSelect(entry)}
                      >
                        {/* The one thing the name does not say: this is the kind
                            whose amount moves, so it is where a monthly bill is
                            typed rather than a figure that sits still. */}
                        {entry.kind === "varies" ? (
                          <TrendingUp
                            size={14}
                            strokeWidth={1.8}
                            aria-label="A different amount every month"
                            className="shrink-0 text-text-tertiary"
                          />
                        ) : null}
                        <span className="min-w-0 flex-1 truncate text-body text-text-secondary sm:text-label">
                          {entry.label}
                        </span>
                        <span className="shrink-0 text-right text-body tabular-nums text-text-primary sm:text-label">
                          {entry.amount === null ? (
                            <span className="text-text-tertiary">—</span>
                          ) : (
                            formatCurrency(entry.amount)
                          )}
                          <EntryTag tag={entry.tag} />
                        </span>
                        <ChevronRight size={15} strokeWidth={1.8} className="shrink-0 text-text-tertiary" />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* The addresses, last, because they are read least — typed twice in a
          decade and only so that bills can be grouped by where you lived. On a
          desktop they stand in the detail column instead, where there is room
          for them without a row here. */}
      {searching ? null : (
        <button
          className={cn(
            "focus-ring mt-3 flex min-h-11 w-full items-center gap-2.5 rounded-[20px] border border-border bg-surface px-3.5 py-2.5 text-left shadow-card transition-colors duration-200 ease-out lg:hidden sm:px-4",
            homesSelected ? "bg-accent-soft/50" : "hover:bg-subtle/60"
          )}
          type="button"
          onClick={onSelectHomes}
        >
          <Home size={15} strokeWidth={1.8} className="shrink-0 text-text-tertiary" />
          <span className="min-w-0 flex-1 truncate text-body text-text-secondary sm:text-label">
            Where you have lived
          </span>
          <span className="shrink-0 text-meta tabular-nums text-text-tertiary">
            {homeCount === 0 ? "—" : homeCount === 1 ? "1 address" : `${homeCount} addresses`}
          </span>
          <ChevronRight size={15} strokeWidth={1.8} className="shrink-0 text-text-tertiary" />
        </button>
      )}
    </div>
  );
}

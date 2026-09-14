"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { MonthPicker } from "@/components/expenses/MonthPicker";
import { MoneyIn, MoneyOut } from "@/components/finances/MonthBreakdown";
import { MonthSummary } from "@/components/finances/MonthSummary";
import { DetailSheet } from "@/components/finances/DetailSheet";
import { YearList } from "@/components/finances/YearList";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { currentPeriodMonth } from "@/lib/expenses";
import { buildYear, clientMonthlyIncome, houseSittingByMonth } from "@/lib/finances";
import { loadFinanceHomes, loadFinanceLines } from "@/lib/financeClient";
import { utilityBook } from "@/lib/utilities";
import type { HistorySubject } from "@/lib/financeHistory";
import { loadUtilities } from "@/lib/utilityClient";
import { parseLocalDate } from "@/lib/formatters";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { ClientWithPets } from "@/types/client";
import type { HouseSittingBooking } from "@/types/houseSitting";
import type { FinanceBucket, FinanceHome, FinanceLine } from "@/types/finance";
import type { UtilityAccount, UtilityBill, UtilityBucket } from "@/types/utility";

/**
 * Finances — the household month.
 *
 * Every other section answers a question about the business. This one asks
 * whether the family came out ahead: what arrived, what the taxman took, what
 * is deducted from pay, what the household owes, and what was put away.
 *
 * Two kinds of number meet here. The standing ones — the W2, rent, the car
 * payment, the insurance taken out of a paycheck — carry a dated schedule and
 * are written in Setup. The ones the app already records — regular clients,
 * house sitting — are read from their own tables, so there is never a second,
 * staler copy of a figure the books already hold.
 *
 * Nothing about the business's tax deduction is on this page. Spending and miles
 * answer a Taxes question and are totalled on Reports; shown here they read as
 * cash the household never handled.
 *
 * The layout answers three questions in the order they get asked: what did the
 * month come to, what is it made of, and how does it compare with the rest of the
 * year. The breakdown shows its lines rather than hiding them — you scan totals to
 * find the odd one and then need the detail immediately — and the year keeps a
 * figure against every month, because comparing months must not require tapping
 * through them one at a time.
 */

export default function FinancesPage() {
  const { user, authLoading } = useAuthUser();
  const [periodMonth, setPeriodMonth] = useState(() => currentPeriodMonth());
  const [lines, setLines] = useState<FinanceLine[]>([]);
  const [homes, setHomes] = useState<FinanceHome[]>([]);
  const [accounts, setAccounts] = useState<UtilityAccount[]>([]);
  const [bills, setBills] = useState<UtilityBill[]>([]);
  // Two notices, kept apart. Either half of the page can be waiting on a
  // migration the other does not need, and a save on one side must not wipe the
  // other side's warning off the screen.
  const [lineNotice, setLineNotice] = useState("");
  const [utilityNotice, setUtilityNotice] = useState("");
  const [clients, setClients] = useState<ClientWithPets[]>([]);
  const [bookings, setBookings] = useState<HouseSittingBooking[]>([]);
  const [loading, setLoading] = useState(true);
  // What the timeline panel is open on — a line, a block, or a whole side of
  // the month. The assembled subject is held rather than a key, because the
  // panel's headline is this month's figure and the thing that was tapped
  // already carries it, along with its hint and its working.
  const [openSubject, setOpenSubject] = useState<HistorySubject | null>(null);

  const year = useMemo(() => parseLocalDate(periodMonth).getFullYear(), [periodMonth]);
  const monthIndex = useMemo(() => parseLocalDate(periodMonth).getMonth(), [periodMonth]);

  // The standing figures are the one thing here that can fail outright, and the
  // derived half of the page is still worth reading without them — so a failure
  // is reported and stepped over rather than thrown, which would leave the whole
  // month stuck behind a skeleton.
  const refreshLines = useCallback(async () => {
    try {
      const { lines: nextLines, setupNeeded, setupMessage } = await loadFinanceLines();
      setLines(nextLines);
      return setupNeeded ? setupMessage : "";
    } catch (error) {
      setLines([]);
      return error instanceof Error ? error.message : "Could not load your figures";
    }
  }, []);

  /**
   * The metered bills, every one of them, not just this year's.
   *
   * A utility is read against its own past — last month, the same month a year
   * ago, the twelve-month average — so a year-scoped query would make January's
   * comparison figures vanish. There is one row per account per month, so the
   * whole history is a few hundred rows at worst.
   */
  /**
   * Where the household has lived.
   *
   * Its own table and its own failure: it groups figures rather than holding
   * any, so a missing migration means the `By home` range has nothing to show
   * and every other range on every chart still draws exactly as before. It is
   * reported alongside the other two notices rather than thrown.
   */
  const refreshHomes = useCallback(async () => {
    try {
      const { homes: nextHomes, setupNeeded, setupMessage } = await loadFinanceHomes();
      setHomes(nextHomes);
      return setupNeeded ? setupMessage : "";
    } catch (error) {
      setHomes([]);
      return error instanceof Error ? error.message : "Could not load your homes";
    }
  }, []);

  const refreshUtilities = useCallback(async () => {
    try {
      const { accounts: nextAccounts, bills: nextBills, setupNeeded, setupMessage } = await loadUtilities();
      setAccounts(nextAccounts);
      setBills(nextBills);
      return setupNeeded ? setupMessage : "";
    } catch (error) {
      setAccounts([]);
      setBills([]);
      return error instanceof Error ? error.message : "Could not load your utilities";
    }
  }, []);

  const loadYear = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);

    const clientQuery = supabase.from("clients").select("*, price_history(*)").order("name", { ascending: true });
    // A stay only has to touch the year to matter — one that starts in December
    // pays for nights in January.
    const bookingQuery = supabase
      .from("house_sittings")
      .select("*")
      .lte("start_date", `${year}-12-31`)
      .gte("end_date", `${year}-01-01`);
    const [clientResult, bookingResult] = await Promise.all([clientQuery, bookingQuery]);

    setClients(
      ((clientResult.data ?? []) as Array<ClientWithPets & { price_history: ClientWithPets["price_history"] }>).map(
        (client) => ({ ...client, pets: [], price_history: client.price_history ?? [] })
      )
    );
    // House sitting is the one linked figure that can be missing entirely: the
    // calendar has its own migration. An unreadable table means no stays, not a
    // broken page.
    setBookings(
      ((bookingResult.data ?? []) as HouseSittingBooking[]).map((booking) => ({
        ...booking,
        status: booking.status === "Cancelled" ? "Cancelled" : "Planned"
      }))
    );
    const [nextLineNotice, nextUtilityNotice, nextHomeNotice] = await Promise.all([
      refreshLines(),
      refreshUtilities(),
      refreshHomes()
    ]);
    setLineNotice([nextLineNotice, nextHomeNotice].filter(Boolean).join(" "));
    setUtilityNotice(nextUtilityNotice);
    setLoading(false);
  }, [refreshHomes, refreshLines, refreshUtilities, user, year]);

  useEffect(() => {
    loadYear();
  }, [loadYear]);

  // Grouped once, not once per month per bucket.
  const book = useMemo(() => utilityBook(accounts, bills), [accounts, bills]);

  // The stays, spread over the nights they were slept in. Built once here rather
  // than inside the month memo, because a line's timeline reads the same array.
  const houseSitting = useMemo(() => houseSittingByMonth(bookings, year), [bookings, year]);

  const months = useMemo(
    () =>
      buildYear({
        year,
        lines,
        clientIncome: clientMonthlyIncome(clients),
        houseSitting,
        utilities: book
      }),
    [book, clients, houseSitting, lines, year]
  );

  const month = months[monthIndex];
  // Everything a line's past can be read out of, gathered once. The page already
  // holds all of it to build the month at all, which is why opening a line costs
  // no query and can be a panel over the month rather than a route away from it.
  const historySources = useMemo(
    () => ({ lines, book, houseSitting, clients, homes }),
    [book, clients, homes, houseSitting, lines]
  );
  // One box, not two stacked above the month: they are both "run this migration",
  // and a second warning costs more height than the sentence is worth.
  const notice = [lineNotice, utilityNotice].filter(Boolean).join(" ");

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      {/* One way in, and it is a screen rather than a dialog.

          There were two chips here — Setup for the standing figures, Utilities
          for the metered bills — and which one held a given thing was decided by
          how the app stores it rather than by anything the person with a bill in
          their hand knows. Both opened a panel over the month, and inside it the
          figure was four levels down. One button, one destination, and it is a
          real page: `/finances/manage`. */}
      <PageHeader
        title="Finances"
        action={
          <Link
            href="/finances/manage"
            className="focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-subtle px-3.5 text-body font-medium text-text-primary transition-colors duration-200 ease-out hover:bg-border"
          >
            <SlidersHorizontal size={16} strokeWidth={1.8} />
            Manage
          </Link>
        }
      />
      <div className="space-y-3">
        {notice ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-warning/35 bg-warning-soft px-3.5 py-3 text-list text-text-primary">
            <AlertTriangle size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-warning" />
            <span>{notice}</span>
          </div>
        ) : null}

        {loading || !month ? (
          <SkeletonRows />
        ) : (
          <>
            {/* Two columns, and every region of them used. The breakdown is
                capped at the width its rows actually need — label on the left,
                amount on the right, and past ~460px the middle is just a gap —
                so the leftover-by-month block gets the rest, where the extra
                width turns its bars into something you can read across.

                The picker sits at the top of the right column because that is
                where the empty space was: the header row already carries the
                title and Setup, and a control on a row of its own left the whole
                top right of the page blank. Placement is explicit per cell so
                the phone still reads picker, month, breakdown, year. */}
            {/* minmax(0,…) on the phone's single column too, not just the
                desktop pair: an auto grid track sizes to its widest item's
                min-content, so one long line name inside the breakdown pushed
                the whole page 81px wider than the screen and everything scrolled
                sideways. */}
            {/* Two columns where there is width. The left one is the month's
                own arithmetic — how much is spoken for and by which block, then
                what came in to measure it against — and the right one is the
                detail you act on: every commitment on one scale, then the year.

                Phone order is the order the questions get asked: which month,
                what it came to, how much is committed, what to go after, where
                the money came from, and only then how the months compare. */}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
              <div className="order-1 lg:col-start-1 lg:row-start-1">
                <MonthPicker periodMonth={periodMonth} onChange={setPeriodMonth} variant="panel" />
              </div>
              <div className="order-2 lg:col-start-2 lg:row-start-1">
                <MonthSummary month={month} />
              </div>

              {/* Money in first on a phone — it is the denominator every share
                  below is measured against — then the blocks it is spent on,
                  then the year. On a desktop the long sectioned card takes the
                  left column for both rows and the two short blocks stack
                  beside it. */}
              <div className="order-3 lg:col-start-2 lg:row-start-2 lg:self-start">
                <MoneyIn month={month} onOpen={setOpenSubject} />
              </div>

              <div className="order-4 lg:col-start-1 lg:row-start-2 lg:row-span-2 lg:self-start">
                <MoneyOut month={month} onOpen={setOpenSubject} />
              </div>

              <div className="order-5 lg:col-start-2 lg:row-start-3 lg:self-start">
                <YearList
                  months={months}
                  year={year}
                  selectedIndex={monthIndex}
                  onSelect={(nextMonth) =>
                    setPeriodMonth(`${year}-${String(nextMonth + 1).padStart(2, "0")}-01`)
                  }
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* A line, a block or a whole side, opened: its timeline first, then this
          month's working and every figure behind the chart as text. It reads the
          same sources the month behind it was built from, so it opens instantly
          and closing puts the reader back on exactly what they tapped. */}
      {openSubject ? (
        <DetailSheet
          subject={openSubject}
          periodMonth={periodMonth}
          sources={historySources}
          onClose={() => setOpenSubject(null)}
        />
      ) : null}

    </AppShell>
  );
}

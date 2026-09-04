"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Droplets, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { MonthPicker } from "@/components/expenses/MonthPicker";
import { MoneyIn, MoneyOut } from "@/components/finances/MonthBreakdown";
import { MonthSummary } from "@/components/finances/MonthSummary";
import { SetupSheet } from "@/components/finances/SetupSheet";
import { UtilitiesSheet } from "@/components/finances/UtilitiesSheet";
import { YearList } from "@/components/finances/YearList";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { currentPeriodMonth } from "@/lib/expenses";
import { buildYear, clientMonthlyIncome, houseSittingByMonth } from "@/lib/finances";
import {
  addFinanceLine,
  deleteFinanceLine,
  deleteFinanceRate,
  loadFinanceLines,
  renameFinanceLine,
  setFinanceRate,
  updateFinanceRate
} from "@/lib/financeClient";
import { utilityBook } from "@/lib/utilities";
import {
  addUtilityAccount,
  deleteUtilityAccount,
  deleteUtilityBill,
  loadUtilities,
  setUtilityBill,
  updateUtilityAccount
} from "@/lib/utilityClient";
import { parseLocalDate } from "@/lib/formatters";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { ClientWithPets } from "@/types/client";
import type { HouseSittingBooking } from "@/types/houseSitting";
import type { FinanceBucket, FinanceLine } from "@/types/finance";
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
  const [setupOpen, setSetupOpen] = useState(false);
  const [utilitiesOpen, setUtilitiesOpen] = useState(false);
  const [toast, setToast] = useState("");

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
    const [nextLineNotice, nextUtilityNotice] = await Promise.all([refreshLines(), refreshUtilities()]);
    setLineNotice(nextLineNotice);
    setUtilityNotice(nextUtilityNotice);
    setLoading(false);
  }, [refreshLines, refreshUtilities, user, year]);

  useEffect(() => {
    loadYear();
  }, [loadYear]);

  // Grouped once, not once per month per bucket.
  const book = useMemo(() => utilityBook(accounts, bills), [accounts, bills]);

  const months = useMemo(
    () =>
      buildYear({
        year,
        lines,
        clientIncome: clientMonthlyIncome(clients),
        houseSitting: houseSittingByMonth(bookings, year),
        utilities: book
      }),
    [book, bookings, clients, lines, year]
  );

  const month = months[monthIndex];
  // One box, not two stacked above the month: they are both "run this migration",
  // and a second warning costs more height than the sentence is worth.
  const notice = [lineNotice, utilityNotice].filter(Boolean).join(" ");

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  // Setup edits in place over the month, so a save refreshes the figures behind
  // it rather than navigating anywhere.
  async function runLineChange(action: () => Promise<void>, message: string) {
    try {
      await action();
      setLineNotice(await refreshLines());
      showToast(message);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save that");
    }
  }

  async function runUtilityChange(action: () => Promise<void>, message: string) {
    try {
      await action();
      setUtilityNotice(await refreshUtilities());
      showToast(message);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save that");
    }
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      {/* Setup is visited a few times a year, so it is a control on a row that
          already exists rather than a tab holding half the width on every visit. */}
      {/* Two panels, two chips, and no permanent row spent on either. Utilities
          is the one that is opened often — a bill a week arrives — so it keeps
          its word at every width; Setup is visited a few times a year and gives
          its label up on a phone, where the two together would not fit beside a
          30px title. */}
      <PageHeader
        title="Finances"
        action={
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setUtilitiesOpen(true)}
              className="focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-subtle px-3.5 text-[14px] font-medium text-text-primary transition-colors duration-200 ease-out hover:bg-border"
            >
              <Droplets size={16} strokeWidth={1.8} />
              Utilities
            </button>
            <button
              type="button"
              aria-label="Setup"
              onClick={() => setSetupOpen(true)}
              className="focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-subtle px-3 text-[14px] font-medium text-text-primary transition-colors duration-200 ease-out hover:bg-border sm:px-3.5"
            >
              <SlidersHorizontal size={16} strokeWidth={1.8} />
              <span className="hidden sm:inline">Setup</span>
            </button>
          </div>
        }
      />
      <div className="space-y-3">
        {notice ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-warning/35 bg-warning-soft px-3.5 py-3 text-[13px] text-text-primary">
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
                <MoneyIn month={month} />
              </div>

              <div className="order-4 lg:col-start-1 lg:row-start-2 lg:row-span-2 lg:self-start">
                <MoneyOut month={month} />
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

      {setupOpen ? (
        <SetupSheet
          lines={lines}
          notice={notice}
          onClose={() => setSetupOpen(false)}
          onAddLine={(input) =>
            runLineChange(
              () =>
                addFinanceLine({
                  userId: user.id,
                  bucket: input.bucket as FinanceBucket,
                  label: input.label,
                  amount: input.amount,
                  cadence: input.cadence,
                  effectiveFrom: input.effectiveFrom,
                  effectiveTo: input.effectiveTo,
                  existingCount: lines.filter((line) => line.bucket === input.bucket).length
                }),
              `${input.label} added`
            )
          }
          onRename={(lineId, label) => runLineChange(() => renameFinanceLine(lineId, label), "Renamed")}
          onSetRate={(lineId, effectiveFrom, amount, cadence, effectiveTo) =>
            runLineChange(
              () => setFinanceRate({ userId: user.id, lineId, effectiveFrom, amount, cadence, effectiveTo }),
              "Change saved"
            )
          }
          onUpdateRate={(rateId, effectiveFrom, amount, cadence, effectiveTo) =>
            runLineChange(
              () => updateFinanceRate({ id: rateId, effectiveFrom, amount, cadence, effectiveTo }),
              effectiveTo ? "End date saved" : "Change updated"
            )
          }
          onDeleteRate={(rateId) => runLineChange(() => deleteFinanceRate(rateId), "Change removed")}
          onDeleteLine={(lineId) => runLineChange(() => deleteFinanceLine(lineId), "Line deleted")}
        />
      ) : null}

      {utilitiesOpen ? (
        <UtilitiesSheet
          book={book}
          periodMonth={periodMonth}
          notice={utilityNotice}
          onClose={() => setUtilitiesOpen(false)}
          onAddAccount={({ name, bucket }) =>
            runUtilityChange(
              () => addUtilityAccount({ userId: user.id, name, bucket, existingCount: accounts.length }),
              `${name} added`
            )
          }
          onRename={(accountId, name) =>
            runUtilityChange(() => updateUtilityAccount(accountId, { name }), "Renamed")
          }
          onSetBucket={(accountId, bucket: UtilityBucket) =>
            runUtilityChange(
              () => updateUtilityAccount(accountId, { bucket }),
              `Counted in ${bucket}`
            )
          }
          onDeleteAccount={(accountId) => runUtilityChange(() => deleteUtilityAccount(accountId), "Deleted")}
          onSetBill={(accountId, billPeriodMonth, amount) =>
            runUtilityChange(
              () => setUtilityBill({ userId: user.id, accountId, periodMonth: billPeriodMonth, amount }),
              "Bill saved"
            )
          }
          onDeleteBill={(billId) => runUtilityChange(() => deleteUtilityBill(billId), "Bill removed")}
        />
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}

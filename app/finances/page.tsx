"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { MonthPicker } from "@/components/expenses/MonthPicker";
import { BucketRows } from "@/components/finances/BucketRows";
import { MonthSummary } from "@/components/finances/MonthSummary";
import { SetupSheet } from "@/components/finances/SetupSheet";
import { YearList } from "@/components/finances/YearList";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { currentPeriodMonth } from "@/lib/expenses";
import {
  buildYear,
  clientMonthlyIncome,
  houseSittingByMonth,
  mileageByMonth,
  spendByMonth
} from "@/lib/finances";
import {
  addFinanceLine,
  deleteFinanceLine,
  deleteFinanceRate,
  loadFinanceLines,
  renameFinanceLine,
  setFinanceRate
} from "@/lib/financeClient";
import { parseLocalDate } from "@/lib/formatters";
import { dateFromTimestamp, loadMileageTrips, loadMileageUploads } from "@/lib/mileage";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { ClientWithPets } from "@/types/client";
import type { Expense } from "@/types/expense";
import type { HouseSittingBooking } from "@/types/houseSitting";
import type { MileageTrip } from "@/types/mileage";
import type { FinanceBucket, FinanceLine } from "@/types/finance";

/**
 * Finances — the household month.
 *
 * Every other section answers a question about the business. This one asks
 * whether the family came out ahead: what arrived, what the taxman took, what
 * the business spent, what the household owes, and what was put away.
 *
 * Two kinds of number meet here. The standing ones — the W2, rent, the car
 * payment — carry a dated schedule and are written in Setup. The ones the app
 * already records — regular clients, house sitting, business spending, miles —
 * are read from their own tables, so there is never a second, staler copy of a
 * figure the books already hold.
 *
 * The mileage deduction is shown but never subtracted. It lowers a tax bill, not
 * a bank balance, and counting it as money out would invent a deficit.
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
  const [notice, setNotice] = useState("");
  const [clients, setClients] = useState<ClientWithPets[]>([]);
  const [bookings, setBookings] = useState<HouseSittingBooking[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [trips, setTrips] = useState<MileageTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupOpen, setSetupOpen] = useState(false);
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
    const expenseQuery = supabase
      .from("expenses")
      .select("*")
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`);

    const [clientResult, bookingResult, expenseResult] = await Promise.all([
      clientQuery,
      bookingQuery,
      expenseQuery
    ]);

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
    setExpenses((expenseResult.data ?? []) as Expense[]);

    const scope = { ownerId: "all" };
    const { uploads } = await loadMileageUploads(scope);
    const { trips: nextTrips } = await loadMileageTrips(
      scope,
      uploads.filter((upload) => upload.is_active).map((upload) => upload.id)
    );
    setTrips(nextTrips.filter((trip) => dateFromTimestamp(trip.start_at).getFullYear() === year));

    setNotice(await refreshLines());
    setLoading(false);
  }, [refreshLines, user, year]);

  useEffect(() => {
    loadYear();
  }, [loadYear]);

  const months = useMemo(
    () =>
      buildYear({
        year,
        lines,
        clientIncome: clientMonthlyIncome(clients),
        houseSitting: houseSittingByMonth(bookings, year),
        spend: spendByMonth(expenses, year),
        mileage: mileageByMonth(trips, year)
      }),
    [bookings, clients, expenses, lines, trips, year]
  );

  const month = months[monthIndex];

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  // Setup edits in place over the month, so a save refreshes the figures behind
  // it rather than navigating anywhere.
  async function runLineChange(action: () => Promise<void>, message: string) {
    try {
      await action();
      setNotice(await refreshLines());
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
      <PageHeader
        title="Finances"
        action={
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-subtle px-3.5 text-[14px] font-medium text-text-primary transition-colors duration-200 ease-out hover:bg-border"
          >
            <SlidersHorizontal size={16} strokeWidth={1.8} />
            Setup
          </button>
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
            <div className="grid gap-3 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
              {/* The header pair: the month, and what the month came to. Both are
                  a fixed 60px whatever is in them, and they share a grid row, so
                  neither can move the other. Row two is the detail and the year. */}
              <div className="lg:col-start-2 lg:row-start-1">
                <MonthPicker periodMonth={periodMonth} onChange={setPeriodMonth} variant="panel" />
              </div>
              <div className="lg:col-start-1 lg:row-start-1">
                <MonthSummary month={month} />
              </div>
              <div className="lg:col-start-1 lg:row-start-2">
                <BucketRows sections={month.sections} moneyIn={month.moneyIn} />
              </div>
              <div className="lg:col-start-2 lg:row-start-2 lg:self-start">
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
                  effectiveFrom: input.effectiveFrom,
                  existingCount: lines.filter((line) => line.bucket === input.bucket).length
                }),
              `${input.label} added`
            )
          }
          onRename={(lineId, label) => runLineChange(() => renameFinanceLine(lineId, label), "Renamed")}
          onSetRate={(lineId, effectiveFrom, amount) =>
            runLineChange(() => setFinanceRate({ userId: user.id, lineId, effectiveFrom, amount }), "Change saved")
          }
          onDeleteRate={(rateId) => runLineChange(() => deleteFinanceRate(rateId), "Change removed")}
          onDeleteLine={(lineId) => runLineChange(() => deleteFinanceLine(lineId), "Line deleted")}
        />
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}

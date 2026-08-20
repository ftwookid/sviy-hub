"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { BucketRows } from "@/components/finances/BucketRows";
import { MonthOverview } from "@/components/finances/MonthOverview";
import { SetupSheet } from "@/components/finances/SetupSheet";
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
 * Two cards, and the month reads without scrolling on a phone: the overview
 * carries its own month navigation, and the six blocks are six rows that open.
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
            <MonthOverview
              month={month}
              months={months}
              periodMonth={periodMonth}
              monthIndex={monthIndex}
              year={year}
              onPeriodChange={setPeriodMonth}
              onMonthIndexChange={(nextMonth) =>
                setPeriodMonth(`${year}-${String(nextMonth + 1).padStart(2, "0")}-01`)
              }
            />
            <BucketRows sections={month.sections} moneyIn={month.moneyIn} />
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

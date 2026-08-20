"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { MonthPicker } from "@/components/expenses/MonthPicker";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { BucketCard } from "@/components/finances/BucketCard";
import { CashflowStrip } from "@/components/finances/CashflowStrip";
import { FinanceTabs } from "@/components/finances/FinanceTabs";
import { MonthBalanceCard } from "@/components/finances/MonthBalanceCard";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { currentPeriodMonth, periodMonthLabel } from "@/lib/expenses";
import {
  BUCKET_BLURBS,
  buildYear,
  clientMonthlyIncome,
  houseSittingByMonth,
  mileageByMonth,
  spendByMonth
} from "@/lib/finances";
import { loadFinanceLines } from "@/lib/financeClient";
import { parseLocalDate } from "@/lib/formatters";
import { dateFromTimestamp, loadMileageTrips, loadMileageUploads } from "@/lib/mileage";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { ClientWithPets } from "@/types/client";
import type { Expense } from "@/types/expense";
import type { HouseSittingBooking } from "@/types/houseSitting";
import type { MileageTrip } from "@/types/mileage";
import type { FinanceLine, FinanceSectionKey } from "@/types/finance";

/**
 * Finances — the household month.
 *
 * Every other section answers a question about the business. This one asks
 * whether the family came out ahead: what arrived, what the taxman took, what
 * the business spent, what the household owes, and what was put away.
 *
 * Two kinds of number meet here. The standing ones — the W2, rent, the car
 * payment — are typed in once and stand in every month. The ones the app already
 * records — regular clients, house sitting, business spending, miles — are read
 * from their own tables and are not editable here, so there is never a second,
 * staler copy of a figure the books already hold.
 *
 * The mileage deduction is shown but never subtracted. It lowers a tax bill, not
 * a bank balance, and counting it as money out would invent a deficit.
 */

const SECTION_TITLES: Record<FinanceSectionKey, string> = {
  "Gross Income": "Gross income",
  "Tax Withheld": "Tax withheld",
  Deductions: "Deductions",
  Needs: "Needs",
  Debt: "Debt",
  "Investments & Savings": "Investments & savings"
};

const DEDUCTIONS_BLURB = "What the business spent, from your books";

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

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      <PageHeader title="Finances" />
      <div className="space-y-3">
        <FinanceTabs />

        <div className="max-w-[280px]">
          <MonthPicker periodMonth={periodMonth} onChange={setPeriodMonth} />
        </div>

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
            <MonthBalanceCard month={month} monthLabel={periodMonthLabel(periodMonth)} />

            {month.sections.map((section) => (
              <BucketCard
                key={section.key}
                section={section}
                title={SECTION_TITLES[section.key]}
                blurb={section.key === "Deductions" ? DEDUCTIONS_BLURB : BUCKET_BLURBS[section.key]}
                moneyIn={month.moneyIn}
              />
            ))}

            <CashflowStrip
              months={months}
              year={year}
              selectedIndex={monthIndex}
              onSelect={(nextMonth) => setPeriodMonth(`${year}-${String(nextMonth + 1).padStart(2, "0")}-01`)}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}

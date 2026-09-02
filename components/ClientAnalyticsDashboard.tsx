"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  MapPinned
} from "lucide-react";
import { useState } from "react";
import { ClientMap } from "@/components/ClientMap";
import { Figure, FigureGrid } from "@/components/ui/FigureGrid";
import { cn } from "@/lib/cn";
import { estimateClientCurrentEarnings, estimateClientEarnings, selectedDaysFromRecord, WEEK_DAYS, WEEKS_PER_MONTH } from "@/lib/clients";
import { formatCurrency, toInputDate } from "@/lib/formatters";
import type { ClientPaymentMethod, ClientWithPets } from "@/types/client";

type ClientDashboardProps = {
  clients: ClientWithPets[];
};

const PAYMENT_METHODS: ClientPaymentMethod[] = ["Rover", "Venmo", "Cash"];
const ESTIMATED_TAX_RATE = 0.28;

type ClientMetric = {
  client: ClientWithPets;
  pets: string;
  service: string;
  paymentMethod: ClientPaymentMethod;
  visitDays: string[];
  weeklyGross: number;
  weeklyNet: number;
  monthlyGross: number;
  monthlyNet: number;
  annualNet: number;
  commission: number;
  taxableMonthlyNet: number;
  netPerVisit: number;
};

type Totals = {
  weeklyGross: number;
  weeklyNet: number;
  monthlyGross: number;
  monthlyNet: number;
  annualNet: number;
  commission: number;
  taxableMonthlyNet: number;
  visitsPerWeek: number;
};

type Trend = {
  label: string;
  reference: string;
  direction: "up" | "down" | "flat";
  tone: "good" | "bad" | "neutral";
};

function petNames(client: ClientWithPets) {
  return client.pets.map((pet) => pet.name || pet.type).join(", ") || "No pets listed";
}

function serviceLabel(client: ClientWithPets) {
  return client.service_type === "Custom" ? client.custom_service_type || "Custom" : client.service_type;
}

function clientVisitDays(client: ClientWithPets) {
  return selectedDaysFromRecord(client.frequency_label, client.visits_per_week);
}

function percent(value: number) {
  return `${Math.round(value)}%`;
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: Math.abs(value) < 1000 ? 0 : 1
  }).format(value);
}

function share(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function barWidth(value: number, total: number) {
  const nextShare = share(value, total);
  if (nextShare <= 0) return "0%";
  return `${Math.max(4, Math.min(100, nextShare))}%`;
}

function clientStartDate(client: ClientWithPets) {
  const firstPriceDate = (client.price_history ?? [])
    .map((entry) => entry.effective_date)
    .sort((a, b) => a.localeCompare(b))[0];

  return firstPriceDate ?? client.created_at.slice(0, 10);
}

function clientPriceOn(client: ClientWithPets, dateValue: string) {
  if (clientStartDate(client) > dateValue) return null;
  const entry = (client.price_history ?? [])
    .filter((priceEntry) => priceEntry.effective_date <= dateValue)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];

  return Number(entry?.price ?? client.price_per_visit);
}

function clientMetric(client: ClientWithPets, dateValue?: string): ClientMetric | null {
  const price = dateValue ? clientPriceOn(client, dateValue) : null;
  if (dateValue && price === null) return null;

  const estimate = dateValue
    ? estimateClientEarnings({
        pricePerVisit: price ?? 0,
        visitsPerWeek: client.visits_per_week,
        paymentMethod: client.payment_method,
        commissionRate: Number(client.rover_commission_rate)
      })
    : estimateClientCurrentEarnings(client);
  const visitDays = clientVisitDays(client);
  const weeklyNet = estimate.monthlyNet / WEEKS_PER_MONTH;
  const netPerVisit = visitDays.length > 0 ? weeklyNet / visitDays.length : 0;

  return {
    client,
    pets: petNames(client),
    service: serviceLabel(client),
    paymentMethod: client.payment_method,
    visitDays,
    weeklyGross: estimate.weeklyGross,
    weeklyNet,
    monthlyGross: estimate.monthlyGross,
    monthlyNet: estimate.monthlyNet,
    annualNet: estimate.monthlyNet * 12,
    commission: estimate.commission,
    taxableMonthlyNet: estimate.taxable ? estimate.monthlyNet : 0,
    netPerVisit
  };
}

function sumTotals(metrics: ClientMetric[]): Totals {
  return metrics.reduce(
    (nextTotals, item) => ({
      weeklyGross: nextTotals.weeklyGross + item.weeklyGross,
      weeklyNet: nextTotals.weeklyNet + item.weeklyNet,
      monthlyGross: nextTotals.monthlyGross + item.monthlyGross,
      monthlyNet: nextTotals.monthlyNet + item.monthlyNet,
      annualNet: nextTotals.annualNet + item.annualNet,
      commission: nextTotals.commission + item.commission,
      taxableMonthlyNet: nextTotals.taxableMonthlyNet + item.taxableMonthlyNet,
      visitsPerWeek: nextTotals.visitsPerWeek + item.visitDays.length
    }),
    {
      weeklyGross: 0,
      weeklyNet: 0,
      monthlyGross: 0,
      monthlyNet: 0,
      annualNet: 0,
      commission: 0,
      taxableMonthlyNet: 0,
      visitsPerWeek: 0
    }
  );
}

function comparisonDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return toInputDate(date);
}

function metricTrend(current: number, previous: number, options?: { inverse?: boolean }): Trend {
  const difference = current - previous;
  const direction = Math.abs(difference) < 0.01 ? "flat" : difference > 0 ? "up" : "down";
  // No "YoY" in the label. It was on all six figures at once, and those 28px
  // apiece were what clipped the line the badge shares — the arrow and the
  // sign already say "change", and the period is on the badge's title and its
  // accessible name, where it costs no width.
  const label =
    previous > 0 || current > 0
      ? `${direction === "up" ? "+" : direction === "down" ? "-" : ""}${formatCompactCurrency(Math.abs(difference))}`
      : "Flat";

  const isGood = options?.inverse ? direction === "down" : direction === "up";
  const isBad = options?.inverse ? direction === "up" : direction === "down";

  return {
    label,
    reference: `LY ${formatCompactCurrency(previous)}`,
    direction,
    tone: direction === "flat" ? "neutral" : isGood ? "good" : isBad ? "bad" : "neutral"
  };
}

/**
 * Performance — what the regular book earns, and what it is made of.
 *
 * This screen was six full-width metric cards stacked down a phone, then five
 * more panels under them: twelve bordered boxes and 3,223px of scroll at 390px,
 * which is 3.6 screens to read numbers that add up to about a dozen figures.
 * Every card charged a border, a shadow, an icon badge and two lots of padding
 * for one number, and each one spent its width on a 32px badge at the right
 * while the number itself sat in the left third. Tablets were no better: the
 * grid only ever unfolded at 1280px, so a 768px iPad read the same single
 * column as a phone.
 *
 * It is two containers now:
 *
 * 1. **The figures**, in one hairline grid — two across on a phone, three on a
 *    tablet, six on a desktop — with no icons and no captions restating the
 *    arithmetic ("Average weekly net divided by scheduled visits" under a
 *    figure named Net/visit). The YoY change sits on the same line as the
 *    number rather than on a row of its own.
 * 2. **The breakdowns**, in one card split by `border-t`, one section each.
 *
 * The sections are rows that expand on a phone and are simply open from 768px
 * up, where the width exists and hiding things would only cost taps — the
 * switch is at `md` rather than `lg` because a collapsed row on an iPad put its
 * title and its figure at opposite ends of a 1,000px rule with nothing in
 * between, which is the same wasted width this rewrite exists to remove. The
 * collapsed row is not a blank label either: it carries that section's headline
 * ("Rover · 62%", "Fri busiest"), so the four collapsed rows still answer four
 * questions without being opened.
 *
 * The old "Smart read" panel is gone, folded into the sections its three lines
 * belonged to: the top client and the best net/visit are read off the rankings
 * they were duplicating, and the top-three concentration is now the rankings
 * section's own headline.
 */

function TrendBadge({ trend }: { trend: Trend }) {
  const Icon = trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : ArrowRight;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium",
        trend.tone === "good" && "text-success",
        trend.tone === "bad" && "text-danger",
        trend.tone === "neutral" && "text-text-tertiary"
      )}
      title={`Year on year · ${trend.reference}`}
      aria-label={`${trend.label} year on year, ${trend.reference}`}
    >
      <Icon className="shrink-0" size={12} strokeWidth={1.9} />
      {trend.label}
    </span>
  );
}

/**
 * One breakdown, as a row of the single card.
 *
 * Expandable on a phone, permanently open from `lg` up — the same component
 * either way, with the breakpoint doing the work in CSS rather than a
 * `matchMedia` read that would have to guess before the first paint.
 */
function Section({
  title,
  summary,
  children
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors duration-200 ease-out md:pointer-events-none"
      >
        <span className="shrink-0 text-[13px] font-medium text-text-primary">{title}</span>
        {/* The headline sits on the row itself, so a closed section still says
            something. It is redundant once the section is open, and on a
            desktop the section is always open — so it goes away in both cases
            rather than repeating what is directly underneath it. */}
        <span className={cn("min-w-0 flex-1 truncate text-right text-[12px] text-text-secondary", open && "hidden", "md:hidden")}>
          {summary}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={1.9}
          className={cn("shrink-0 text-text-tertiary transition-transform duration-200 ease-out md:hidden", open && "rotate-180")}
        />
      </button>
      <div className={cn("px-3.5 pb-3.5", open ? "block" : "hidden md:block")}>{children}</div>
    </div>
  );
}

function BarRow({
  label,
  value,
  detail,
  amount,
  max,
  accent = false
}: {
  label: string;
  value: string;
  detail?: string;
  amount: number;
  max: number;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[12px] font-medium">
        <span className="min-w-0 truncate text-text-secondary">{label}</span>
        <span className="shrink-0 tabular-nums text-text-primary">{value}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-subtle">
        <div className={cn("h-full rounded-full", accent ? "bg-text-primary" : "bg-accent")} style={{ width: barWidth(amount, max) }} />
      </div>
      {detail ? <div className="mt-1 truncate text-[11px] text-text-tertiary">{detail}</div> : null}
    </div>
  );
}

export function ClientAnalyticsDashboard({ clients }: ClientDashboardProps) {
  const previousDate = comparisonDate();
  const clientMetrics = clients.map((client) => clientMetric(client)).filter((item): item is ClientMetric => Boolean(item));
  const previousMetrics = clients.map((client) => clientMetric(client, previousDate)).filter((item): item is ClientMetric => Boolean(item));

  const totals = sumTotals(clientMetrics);
  const previousTotals = sumTotals(previousMetrics);

  const sortedByWeekly = clientMetrics.slice().sort((a, b) => b.weeklyNet - a.weeklyNet);
  const sortedByEfficiency = clientMetrics.slice().filter((item) => item.netPerVisit > 0).sort((a, b) => b.netPerVisit - a.netPerVisit);
  const topThreeNet = sortedByWeekly.slice(0, 3).reduce((sum, item) => sum + item.monthlyNet, 0);
  const averageWeekly = clients.length > 0 ? totals.weeklyNet / clients.length : 0;
  const previousAverageWeekly = previousMetrics.length > 0 ? previousTotals.weeklyNet / previousMetrics.length : 0;
  const averagePerVisit = totals.visitsPerWeek > 0 ? totals.weeklyNet / totals.visitsPerWeek : 0;
  const previousAveragePerVisit = previousTotals.visitsPerWeek > 0 ? previousTotals.weeklyNet / previousTotals.visitsPerWeek : 0;
  const taxReserve = totals.taxableMonthlyNet * ESTIMATED_TAX_RATE;
  const previousTaxReserve = previousTotals.taxableMonthlyNet * ESTIMATED_TAX_RATE;
  const platformRate = totals.monthlyGross > 0 ? share(totals.commission, totals.monthlyGross) : 0;

  const paymentBreakdown = PAYMENT_METHODS.map((method) => {
    const methodClients = clientMetrics.filter((item) => item.paymentMethod === method);
    const monthlyNet = methodClients.reduce((sum, item) => sum + item.monthlyNet, 0);
    return {
      method,
      count: methodClients.length,
      monthlyNet,
      share: share(monthlyNet, totals.monthlyNet)
    };
  });
  const topPayment = paymentBreakdown.slice().sort((a, b) => b.monthlyNet - a.monthlyNet)[0];

  const dayBreakdown = WEEK_DAYS.map((day) => {
    const dayClients = clientMetrics.filter((item) => item.visitDays.includes(day));
    return {
      day,
      visits: dayClients.length,
      weeklyNet: dayClients.reduce((sum, item) => sum + (item.visitDays.length > 0 ? item.weeklyNet / item.visitDays.length : 0), 0)
    };
  });
  const maxDayVisits = Math.max(1, ...dayBreakdown.map((item) => item.visits));
  const busiestDay = dayBreakdown.find((item) => item.visits === maxDayVisits && item.visits > 0);

  const serviceBreakdown = Array.from(
    clientMetrics
      .reduce((groups, item) => {
        const current = groups.get(item.service) ?? { service: item.service, clients: 0, weeklyNet: 0, visits: 0 };
        current.clients += 1;
        current.weeklyNet += item.weeklyNet;
        current.visits += item.visitDays.length;
        groups.set(item.service, current);
        return groups;
      }, new Map<string, { service: string; clients: number; weeklyNet: number; visits: number }>())
      .values()
  ).sort((a, b) => b.weeklyNet - a.weeklyNet);
  const maxServiceWeekly = Math.max(1, ...serviceBreakdown.map((item) => item.weeklyNet));

  const mappable = clients.filter((client) => client.address.trim().length > 0).length;

  return (
    <section className="space-y-3">
      {/* No heading. The tab row above already says Performance, and the
          paragraph that used to sit here described the page to the one person
          who built it. */}
      <FigureGrid columns="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <Figure
          label="Weekly net"
          value={formatCurrency(totals.weeklyNet)}
          detail={`${totals.visitsPerWeek} ${totals.visitsPerWeek === 1 ? "visit" : "visits"}/wk`}
          aside={<TrendBadge trend={metricTrend(totals.weeklyNet, previousTotals.weeklyNet)} />}
        />
        <Figure
          label="Monthly net"
          value={formatCurrency(totals.monthlyNet)}
          detail={`${formatCompactCurrency(totals.annualNet)}/yr`}
          aside={<TrendBadge trend={metricTrend(totals.monthlyNet, previousTotals.monthlyNet)} />}
        />
        <Figure
          label="Avg/client"
          value={formatCurrency(averageWeekly)}
          detail={`${clients.length} ${clients.length === 1 ? "client" : "clients"}`}
          aside={<TrendBadge trend={metricTrend(averageWeekly, previousAverageWeekly)} />}
        />
        <Figure
          label="Net/visit"
          value={formatCurrency(averagePerVisit)}
          aside={<TrendBadge trend={metricTrend(averagePerVisit, previousAveragePerVisit)} />}
        />
        <Figure
          label="Rover fees"
          value={formatCurrency(totals.commission)}
          detail={`${percent(platformRate)} of gross`}
          aside={<TrendBadge trend={metricTrend(totals.commission, previousTotals.commission, { inverse: true })} />}
        />
        <Figure
          label="Tax reserve"
          value={formatCurrency(taxReserve)}
          detail={`${Math.round(ESTIMATED_TAX_RATE * 100)}% non-cash`}
          aside={<TrendBadge trend={metricTrend(taxReserve, previousTaxReserve, { inverse: true })} />}
        />
      </FigureGrid>

      {/* One card, five sections. On lg they lay out two-up, because the width
          is there and a single column would leave half the card empty. */}
      <div className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card md:grid md:grid-cols-2">
        <Section
          title="Top clients"
          summary={
            sortedByWeekly.length > 0
              ? `Top 3 · ${percent(share(topThreeNet, totals.monthlyNet))}`
              : "No income yet"
          }
        >
          <div className="space-y-2.5">
            {sortedByWeekly.slice(0, 5).map((item, index) => (
              <BarRow
                key={item.client.id}
                label={`${index + 1}. ${item.pets}`}
                value={`${formatCurrency(item.weeklyNet)}/wk`}
                detail={`${item.client.name} · ${formatCurrency(item.netPerVisit)} net/visit`}
                amount={item.weeklyNet}
                max={Math.max(1, sortedByWeekly[0]?.weeklyNet ?? 1)}
                accent={index === 0}
              />
            ))}
            {sortedByWeekly.length === 0 ? (
              <div className="text-[12px] text-text-tertiary">No client income to rank yet.</div>
            ) : null}
            {/* What the old Smart read panel said about efficiency, on the
                block that already ranks the same people. */}
            {sortedByEfficiency[0] ? (
              <div className="border-t border-border pt-2.5 text-[11px] text-text-tertiary">
                Best net/visit: {sortedByEfficiency[0].pets} · {formatCurrency(sortedByEfficiency[0].netPerVisit)}
              </div>
            ) : null}
          </div>
        </Section>

        <Section
          title="Payment mix"
          summary={topPayment && topPayment.monthlyNet > 0 ? `${topPayment.method} · ${percent(topPayment.share)}` : "No income yet"}
        >
          <div className="space-y-2.5">
            {paymentBreakdown.map((item) => (
              <BarRow
                key={item.method}
                label={`${item.method} · ${item.count}`}
                value={percent(item.share)}
                detail={`${formatCurrency(item.monthlyNet)} monthly net`}
                amount={item.monthlyNet}
                max={totals.monthlyNet}
              />
            ))}
          </div>
        </Section>

        <Section
          title="Weekly workload"
          summary={busiestDay ? `${busiestDay.day} busiest · ${busiestDay.visits}` : "Nothing scheduled"}
        >
          <div className="space-y-2">
            {dayBreakdown.map((item) => (
              <BarRow
                key={item.day}
                label={item.day}
                value={`${item.visits}`}
                detail={`${formatCurrency(item.weeklyNet)} net scheduled`}
                amount={item.visits}
                max={maxDayVisits}
                accent={item.visits === maxDayVisits && item.visits > 0}
              />
            ))}
          </div>
        </Section>

        <Section
          title="Service mix"
          summary={serviceBreakdown[0] ? `${serviceBreakdown[0].service} · ${formatCurrency(serviceBreakdown[0].weeklyNet)}/wk` : "No services yet"}
        >
          <div className="space-y-2.5">
            {serviceBreakdown.map((item) => (
              <BarRow
                key={item.service}
                label={`${item.service} · ${item.clients}`}
                value={`${formatCurrency(item.weeklyNet)}/wk`}
                detail={`${item.visits} scheduled ${item.visits === 1 ? "visit" : "visits"}/week`}
                amount={item.weeklyNet}
                max={maxServiceWeekly}
              />
            ))}
          </div>
        </Section>

        {/* The map is 360px of height for a question nobody asks from a phone
            mid-scroll, so it is the one section that stays a section on a
            desktop too — full width beneath the two columns, and closed until
            it is wanted on a phone. */}
        <div className="md:col-span-2">
          <Section title="Client map" summary={`${mappable} of ${clients.length} mapped`}>
            <ClientMap clients={clients} />
          </Section>
        </div>
      </div>
    </section>
  );
}

"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  MapPinned
} from "lucide-react";
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
 * **Nothing is collapsed.** A version of this hid the four breakdowns behind
 * disclosures on a phone, which had the gate rule backwards — forms and setup
 * collapse, readings do not — and made the reader tap four times to see the
 * analysis the tab exists for. Every row is on screen at every width now, and
 * the height that costs is bought back from the rows: one line each, with the
 * bar in a column between the label and the figure instead of on a line of its
 * own. That is 26px a row against 48px, which over eighteen rows is worth more
 * than the disclosures ever saved.
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
 * **Never collapsed.** An earlier version put these behind a disclosure on a
 * phone, which read the gate rule backwards: entry forms, history and setup
 * collapse, and what the page exists to show does not. These rows *are* the
 * reading. The height they cost is paid for by the rows themselves being one
 * line each, not by hiding them.
 *
 * `summary` is for a figure the body does not already state — the top-three
 * concentration, the count of mapped pins. It is deliberately absent from the
 * blocks whose headline is just their own first row: "Fri busiest · 4" above a
 * list in which Friday is plainly the longest bar states a thing twice.
 */
function Section({
  title,
  summary,
  children
}: {
  title: string;
  summary?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border px-3.5 py-3 first:border-t-0">
      <div className="flex items-baseline gap-3">
        <h3 className="shrink-0 text-[13px] font-medium text-text-primary">{title}</h3>
        {summary ? (
          <span className="min-w-0 flex-1 truncate text-right text-[12px] text-text-secondary">{summary}</span>
        ) : null}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * One measured row: what it is, how big, how big in words.
 *
 * A single line, with the bar between the label and the figure rather than on a
 * line of its own beneath them. The three-line version — label row, full-width
 * bar, detail row — cost about 48px a row, and eighteen of those is most of a
 * phone screen spent on eighteen numbers. `sub` buys a second line back for the
 * one block that genuinely carries more than fits: the client rankings, where
 * the owner's name and the net per visit are not derivable from the row above.
 *
 * The bar is a fixed width in its own column, not a share of the row. Letting it
 * flex would give every block a different scale and make the lengths
 * incomparable between them, which is the trap already recorded on Finances.
 */
function BarRow({
  label,
  detail,
  value,
  sub,
  amount,
  max,
  accent = false
}: {
  label: string;
  /** Secondary fact, inline after the label — greyed, and truncated first. */
  detail?: string;
  value: string;
  /** A second line, for rows carrying more than one line can hold. */
  sub?: string;
  amount: number;
  max: number;
  accent?: boolean;
}) {
  return (
    <div className="py-[3px]">
      <div className="flex items-center gap-1.5 sm:gap-2">
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-text-secondary">
          {label}
          {detail ? <span className="font-normal text-text-tertiary"> · {detail}</span> : null}
        </span>
        {/* 40px on a phone: at 320px the 8px this gives back off a 48px column
            is the difference between "Dog walking · 3 · 9 visits" reading in
            full and clipping, and a bar this short is a comparison of lengths
            either way. */}
        <span className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-subtle sm:w-16">
          {amount > 0 ? (
            <span
              className={cn("block h-full rounded-full", accent ? "bg-text-primary" : "bg-accent")}
              style={{ width: barWidth(amount, max) }}
            />
          ) : null}
        </span>
        {/* A fixed figure column, so every bar in the card starts and ends on
            the same two vertical lines. Letting the figure size itself moved
            the bar with it — "$332.20/wk" and "$100.00/wk" are different
            widths, so no two rows shared a baseline and the lengths stopped
            being comparable at a glance, which is the whole job of a bar. */}
        <span className="w-[74px] shrink-0 text-right text-[12px] font-medium tabular-nums text-text-primary">
          {value}
        </span>
      </div>
      {sub ? <div className="truncate text-[11px] leading-tight text-text-tertiary">{sub}</div> : null}
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

  const dayBreakdown = WEEK_DAYS.map((day) => {
    const dayClients = clientMetrics.filter((item) => item.visitDays.includes(day));
    return {
      day,
      visits: dayClients.length,
      weeklyNet: dayClients.reduce((sum, item) => sum + (item.visitDays.length > 0 ? item.weeklyNet / item.visitDays.length : 0), 0)
    };
  });
  const maxDayVisits = Math.max(1, ...dayBreakdown.map((item) => item.visits));

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
          <div>
            {sortedByWeekly.slice(0, 5).map((item, index) => (
              <BarRow
                key={item.client.id}
                label={`${index + 1}. ${item.pets}`}
                value={`${formatCurrency(item.weeklyNet)}/wk`}
                sub={`${item.client.name} · ${formatCurrency(item.netPerVisit)}/visit`}
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
              <div className="mt-1.5 border-t border-border pt-1.5 text-[11px] text-text-tertiary">
                Best net/visit: {sortedByEfficiency[0].pets} · {formatCurrency(sortedByEfficiency[0].netPerVisit)}
              </div>
            ) : null}
          </div>
        </Section>

        {/* No summary on the header: "Cash · 51%" above a list in which Cash is
            plainly the longest bar is the same fact written twice. */}
        <Section title="Payment mix">
          <div>
            {paymentBreakdown.map((item) => (
              <BarRow
                key={item.method}
                label={`${item.method} · ${item.count}`}
                detail={formatCurrency(item.monthlyNet)}
                value={percent(item.share)}
                amount={item.monthlyNet}
                max={totals.monthlyNet}
              />
            ))}
          </div>
        </Section>

        <Section title="Weekly workload">
          <div>
            {dayBreakdown.map((item) => (
              <BarRow
                key={item.day}
                label={item.day}
                detail={formatCurrency(item.weeklyNet)}
                value={`${item.visits}`}
                amount={item.visits}
                max={maxDayVisits}
                accent={item.visits === maxDayVisits && item.visits > 0}
              />
            ))}
          </div>
        </Section>

        <Section title="Service mix">
          <div>
            {serviceBreakdown.map((item) => (
              <BarRow
                key={item.service}
                label={`${item.service} · ${item.clients}`}
                detail={`${item.visits} ${item.visits === 1 ? "visit" : "visits"}`}
                value={`${formatCurrency(item.weeklyNet)}/wk`}
                amount={item.weeklyNet}
                max={maxServiceWeekly}
              />
            ))}
          </div>
        </Section>

        {/* Full width beneath the two columns. Its pin count is on the header
            because nothing in the body states it. */}
        <div className="md:col-span-2">
          <Section title="Client map" summary={`${mappable} of ${clients.length} mapped`}>
            <ClientMap clients={clients} />
          </Section>
        </div>
      </div>
    </section>
  );
}

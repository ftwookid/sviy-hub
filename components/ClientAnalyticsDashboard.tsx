"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  MapPinned
} from "lucide-react";
import { ClientMap } from "@/components/ClientMap";
import { Stat } from "@/components/health/primitives";
import { Figure, FigureGrid } from "@/components/ui/FigureGrid";
import { cn } from "@/lib/cn";
import { estimateClientCurrentEarnings, estimateClientEarnings, selectedDaysFromRecord, WEEK_DAYS, WEEKS_PER_MONTH } from "@/lib/clients";
import { formatCurrency, toInputDate, todayInputValue } from "@/lib/formatters";
import { activeBookings, nightsAwayInYear } from "@/lib/houseSitting";
import type { ClientPaymentMethod, ClientWithPets } from "@/types/client";
import type { HouseSittingBooking } from "@/types/houseSitting";

type ClientDashboardProps = {
  clients: ClientWithPets[];
  /** The stays touching this calendar year, for the nights spent away. */
  bookings: HouseSittingBooking[];
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
        "inline-flex shrink-0 items-center gap-0.5 text-caption font-medium",
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
    <div className="border-t border-border first:border-t-0">
      {/* A tinted strip, not a 13px line of text.
          The five blocks were separated by a hairline and a title set at the
          same weight as the row labels underneath it, so the whole card read as
          one continuous slab — nothing announced where one block ended.

          The fix is not five cards: that is the first item on the pre-ship gate
          ("more than two top-level cards on a screen is a failure"), and five
          borders, five shadows and ten paddings would add about 140px of scroll
          to a page already 1566px on a phone. It is the pattern the Finances
          Setup buckets already use — one container, and a header that outranks
          its rows loudly enough to be a boundary. */}
      <div className="flex items-baseline gap-3 bg-[#F4F2EC] px-3.5 py-2.5">
        <h3 className="shrink-0 text-label font-semibold tracking-[-0.01em] text-text-primary">{title}</h3>
        {summary ? (
          <span className="min-w-0 flex-1 truncate text-right text-meta text-text-secondary">{summary}</span>
        ) : null}
      </div>
      <div className="px-3.5 py-3">{children}</div>
    </div>
  );
}

/**
 * The rows of one block, as a three-column grid.
 *
 * A grid rather than a row of flex items, because the three columns have to
 * line up **down** the block and not just across each row. In the flex version
 * the label was `flex-1`, so it swallowed all the slack and left the bar on a
 * fixed 40px stub with 120px of dead space in front of it — the space was
 * there, it was just being given to a label that did not want it.
 *
 * Now the label track is `max-content`: it sizes to the longest label in the
 * block and no wider, and every remaining pixel goes to the bar. That is also
 * what keeps the bars honest — a grid track is one width for the whole block,
 * so every bar in it is drawn against the same length. Sizing each bar to its
 * own row's slack would make a half-full bar in a short row look longer than a
 * half-full bar in a long one, which is the comparison the bar exists to make.
 *
 * The figure track is a fixed 74px so the bars all end on one line too, and the
 * bar track keeps a floor so a long label cannot squeeze it out of existence.
 */
function BarRows({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,max-content)_minmax(32px,1fr)_74px] items-center gap-x-2 sm:gap-x-3">
      {children}
    </div>
  );
}

/**
 * One measured row: what it is, how big, how big in words.
 *
 * Contributes its cells straight to the parent grid, so the three columns are
 * shared with every other row in the block. `sub` spans all three for the one
 * block that carries more than a line can hold — the client rankings, where the
 * owner's name and the net per visit are not derivable from the row above.
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
    <>
      <span className={cn("min-w-0 truncate text-meta font-medium text-text-secondary", sub ? "pt-1.5" : "py-[3px]")}>
        {label}
        {detail ? <span className="font-normal text-text-tertiary"> · {detail}</span> : null}
      </span>
      <span className={cn("h-1.5 overflow-hidden rounded-full bg-subtle", sub && "mt-1.5")}>
        {/* No mark at all for a zero: an empty track is a bar drawn for a
            quantity that does not exist. */}
        {amount > 0 ? (
          <span
            className={cn("block h-full rounded-full", accent ? "bg-text-primary" : "bg-accent")}
            style={{ width: barWidth(amount, max) }}
          />
        ) : null}
      </span>
      <span
        className={cn(
          "text-right text-meta font-medium tabular-nums text-text-primary",
          sub ? "pt-1.5" : "py-[3px]"
        )}
      >
        {value}
      </span>
      {sub ? (
        <span className="col-span-3 truncate pb-1 text-caption leading-tight text-text-tertiary">{sub}</span>
      ) : null}
    </>
  );
}

type MixRow = {
  key: string;
  /** Label first, then one figure per extra column. */
  cells: string[];
  amount: number;
  max: number;
  /** The figure at the end of the bar. */
  value: string;
};

/**
 * A block that splits one total several ways, as a real table.
 *
 * Payment mix used to set every fact in one grey label — "Rover · 4 ·
 * $1,092.00" — beside a bar and a share. Nothing lined up down the block, so a
 * client count could not be compared with another client count without reading
 * each label from the start, and the money sat in the same tone as the name.
 * Each fact has its own column now, under a heading that names it, with a
 * total row closing the block the way a ledger does: the counts and the money
 * add up in the place they are read.
 *
 * The figure columns size to their widest value so they share one right edge,
 * and the bar keeps a floor so it cannot be squeezed out on a phone.
 */
function MixTable({ head, rows, total }: { head: string[]; rows: MixRow[]; total?: { cells: string[]; value: string } }) {
  const figureColumns = head.length - 2;
  // The label sizes to its longest entry first (it is the thing being read);
  // the bar takes whatever is left, down to a floor, and only a label that
  // still cannot fit truncates.
  const template = `minmax(0,max-content) ${"max-content ".repeat(figureColumns)}minmax(40px,1fr) max-content`;
  const figure = "text-right text-list tabular-nums";
  // Spacing lives inside the cells, not in a grid gap: a gap would break every
  // row's hairline into pieces, one per column.
  const pad = "pl-3 sm:pl-4";

  return (
    <div className="grid items-stretch" style={{ gridTemplateColumns: template }}>
      {head.map((label, index) => (
        <span
          key={label}
          className={cn(
            "pb-1.5 text-caption font-medium uppercase tracking-[0.05em] text-text-tertiary",
            index === 0 ? "text-left" : cn("text-right", pad),
            // The share heading spans the bar and its figure.
            index === head.length - 1 && "col-span-2"
          )}
        >
          {label}
        </span>
      ))}

      {rows.map((row) => (
        <div key={row.key} className="contents">
          <span className="min-w-0 truncate border-t border-border/40 py-2 text-list text-text-primary">{row.cells[0]}</span>
          {row.cells.slice(1).map((cell, index) => (
            <span key={index} className={cn(figure, pad, "border-t border-border/40 py-2 text-text-secondary")}>
              {cell}
            </span>
          ))}
          <span className={cn("flex items-center border-t border-border/40", pad)}>
            <span className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
              {/* No mark at all for a zero. */}
              {row.amount > 0 ? (
                <span className="block h-full rounded-full bg-accent" style={{ width: barWidth(row.amount, row.max) }} />
              ) : null}
            </span>
          </span>
          <span className={cn(figure, pad, "border-t border-border/40 py-2 font-medium text-text-primary")}>{row.value}</span>
        </div>
      ))}

      {total ? (
        <div className="contents">
          <span className="border-t border-border py-2 text-list font-semibold text-text-primary">{total.cells[0]}</span>
          {total.cells.slice(1).map((cell, index) => (
            <span key={index} className={cn(figure, pad, "border-t border-border py-2 font-semibold text-text-primary")}>
              {cell}
            </span>
          ))}
          <span className="border-t border-border" />
          <span className={cn(figure, pad, "border-t border-border py-2 font-semibold text-text-primary")}>{total.value}</span>
        </div>
      ) : null}
    </div>
  );
}

export function ClientAnalyticsDashboard({ clients, bookings }: ClientDashboardProps) {
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

  const today = todayInputValue();
  const year = Number(today.slice(0, 4));
  const daysInYear = new Date(year, 1, 29).getMonth() === 1 ? 366 : 365;
  const away = nightsAwayInYear(bookings, year, today);
  const yearStays = activeBookings(bookings).length;

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
          <BarRows>
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
              <div className="col-span-3 text-meta text-text-tertiary">No client income to rank yet.</div>
            ) : null}
            {/* What the old Smart read panel said about efficiency, on the
                block that already ranks the same people. */}
            {sortedByEfficiency[0] ? (
              <div className="col-span-3 mt-1.5 border-t border-border pt-1.5 text-caption text-text-tertiary">
                Best net/visit: {sortedByEfficiency[0].pets} · {formatCurrency(sortedByEfficiency[0].netPerVisit)}
              </div>
            ) : null}
          </BarRows>
        </Section>

        <Section title="Weekly workload">
          <BarRows>
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
          </BarRows>
        </Section>

        {/* No summary on the header: the total row at the foot already says
            what the block adds up to. */}
        <Section title="Payment mix">
          <MixTable
            head={["Method", "Clients", "Monthly", "Share"]}
            rows={paymentBreakdown.map((item) => ({
              key: item.method,
              cells: [item.method, String(item.count), formatCurrency(item.monthlyNet)],
              amount: item.monthlyNet,
              max: totals.monthlyNet,
              value: percent(item.share)
            }))}
            total={{
              cells: ["Total", String(clientMetrics.length), formatCurrency(totals.monthlyNet)],
              value: "100%"
            }}
          />
        </Section>

        <Section title="Service mix">
          <MixTable
            head={["Service", "Clients", "Visits", "Weekly"]}
            rows={serviceBreakdown.map((item) => ({
              key: item.service,
              cells: [item.service, String(item.clients), String(item.visits)],
              amount: item.weeklyNet,
              max: maxServiceWeekly,
              value: formatCurrency(item.weeklyNet)
            }))}
            total={{
              cells: ["Total", String(clientMetrics.length), String(totals.visitsPerWeek)],
              value: formatCurrency(totals.weeklyNet)
            }}
          />
        </Section>

        {/* A night at a stay is a night not spent at home, so the year's booked
            nights are the days away. Full width, because three figures in a
            divided strip is what the row is for; the stay count is on the
            header because none of the three states it. */}
        <div className="md:col-span-2">
          <Section
            title="House sitting"
            summary={`${year} · ${yearStays} ${yearStays === 1 ? "stay" : "stays"}`}
          >
            <div className="grid grid-cols-3 divide-x divide-border">
              <Stat
                label="Days away"
                value={String(away.total)}
                detail={`${Math.round((away.total / daysInYear) * 100)}% of the year`}
              />
              <Stat label="So far" value={String(away.past)} />
              <Stat label="Still booked" value={String(away.upcoming)} />
            </div>
          </Section>
        </div>

        {/* Full width beneath the two columns. The header counts addresses, not
            pins: whether each one could be placed is the map's own caption. */}
        <div className="md:col-span-2">
          <Section title="Client map" summary={`${mappable} of ${clients.length} with an address`}>
            <ClientMap clients={clients} />
          </Section>
        </div>
      </div>
    </section>
  );
}

"use client";

import {
  Activity,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Clock,
  Crown,
  PieChart,
  ReceiptText,
  TrendingUp,
  Users,
  Wallet
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ClientMap } from "@/components/ClientMap";
import { cn } from "@/lib/cn";
import { estimateClientCurrentEarnings, selectedDaysFromRecord, WEEK_DAYS, WEEKS_PER_MONTH } from "@/lib/clients";
import { formatCurrency } from "@/lib/formatters";
import type { ClientPaymentMethod, ClientWithPets } from "@/types/client";

type ClientDashboardProps = {
  clients: ClientWithPets[];
};

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  emphasis?: boolean;
};

type PanelProps = {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
};

const PAYMENT_METHODS: ClientPaymentMethod[] = ["Rover", "Venmo", "Cash"];
const ESTIMATED_TAX_RATE = 0.28;

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

function share(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function barWidth(value: number, total: number) {
  const nextShare = share(value, total);
  if (nextShare <= 0) return "0%";
  return `${Math.max(4, Math.min(100, nextShare))}%`;
}

function MetricCard({ label, value, detail, icon: Icon, emphasis = false }: MetricCardProps) {
  return (
    <div className={cn("flex h-full flex-col justify-between rounded-[18px] border border-border bg-surface p-4 shadow-card", emphasis && "bg-[#FFFEFB]")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">{label}</div>
          <div className="mt-2 truncate text-[24px] font-medium leading-none text-text-primary">{value}</div>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Icon size={18} strokeWidth={1.6} />
        </span>
      </div>
      <div className="mt-3 text-[13px] leading-snug text-text-secondary">{detail}</div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: PanelProps) {
  return (
    <section className="rounded-[18px] border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2 text-[14px] font-medium text-text-primary">
        <Icon size={16} strokeWidth={1.6} className="text-accent" />
        {title}
      </div>
      <div className="mt-4">{children}</div>
    </section>
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
        <span className="shrink-0 text-text-primary">{value}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-subtle">
        <div className={cn("h-full rounded-full", accent ? "bg-text-primary" : "bg-accent")} style={{ width: barWidth(amount, max) }} />
      </div>
      {detail ? <div className="mt-1 text-[11px] text-text-tertiary">{detail}</div> : null}
    </div>
  );
}

function InsightRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl bg-subtle px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-medium text-text-secondary">{label}</span>
        <span className="text-[14px] font-medium text-text-primary">{value}</span>
      </div>
      <div className="mt-0.5 text-[11px] leading-snug text-text-tertiary">{detail}</div>
    </div>
  );
}

export function ClientAnalyticsDashboard({ clients }: ClientDashboardProps) {
  const clientMetrics = clients.map((client) => {
    const estimate = estimateClientCurrentEarnings(client);
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
  });

  const totals = clientMetrics.reduce(
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

  const sortedByWeekly = clientMetrics.slice().sort((a, b) => b.weeklyNet - a.weeklyNet);
  const sortedByEfficiency = clientMetrics.slice().filter((item) => item.netPerVisit > 0).sort((a, b) => b.netPerVisit - a.netPerVisit);
  const topClient = sortedByWeekly[0] ?? null;
  const topThreeNet = sortedByWeekly.slice(0, 3).reduce((sum, item) => sum + item.monthlyNet, 0);
  const averageWeekly = clients.length > 0 ? totals.weeklyNet / clients.length : 0;
  const averagePerVisit = totals.visitsPerWeek > 0 ? totals.weeklyNet / totals.visitsPerWeek : 0;
  const taxReserve = totals.taxableMonthlyNet * ESTIMATED_TAX_RATE;
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

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-medium leading-tight text-text-primary">Performance dashboard</h2>
        <p className="max-w-2xl text-[14px] text-text-secondary">
          Current prices, workload, payment exposure, platform costs, and client locations for the selected view.
        </p>
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <div className="grid gap-3 sm:grid-cols-2 sm:auto-rows-fr xl:h-full xl:grid-rows-3">
          <MetricCard
            label="Weekly net"
            value={formatCurrency(totals.weeklyNet)}
            detail={`${totals.visitsPerWeek} scheduled ${totals.visitsPerWeek === 1 ? "visit" : "visits"}/week`}
            icon={CircleDollarSign}
            emphasis
          />
          <MetricCard
            label="Monthly net"
            value={formatCurrency(totals.monthlyNet)}
            detail={`${formatCurrency(totals.annualNet)} annual run rate`}
            icon={CalendarDays}
          />
          <MetricCard
            label="Avg/client"
            value={formatCurrency(averageWeekly)}
            detail={`${clients.length} ${clients.length === 1 ? "client" : "clients"} in this view`}
            icon={Users}
          />
          <MetricCard
            label="Net/visit"
            value={formatCurrency(averagePerVisit)}
            detail="Average weekly net divided by scheduled visits"
            icon={Activity}
          />
          <MetricCard
            label="Rover fees"
            value={formatCurrency(totals.commission)}
            detail={`${percent(platformRate)} of monthly gross`}
            icon={ReceiptText}
          />
          <MetricCard
            label="Tax reserve"
            value={formatCurrency(taxReserve)}
            detail={`${Math.round(ESTIMATED_TAX_RATE * 100)}% estimate on non-cash monthly net`}
            icon={Wallet}
          />
        </div>

        <ClientMap clients={clients} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Smart read" icon={TrendingUp}>
          <div className="space-y-2.5">
            <InsightRow
              label="Top client"
              value={topClient ? formatCurrency(topClient.weeklyNet) : formatCurrency(0)}
              detail={topClient ? `${topClient.pets} brings ${percent(share(topClient.monthlyNet, totals.monthlyNet))} of monthly net.` : "No client income to rank yet."}
            />
            <InsightRow
              label="Top 3 concentration"
              value={percent(share(topThreeNet, totals.monthlyNet))}
              detail="Shows how much monthly income depends on the largest clients."
            />
            <InsightRow
              label="Best efficiency"
              value={sortedByEfficiency[0] ? formatCurrency(sortedByEfficiency[0].netPerVisit) : formatCurrency(0)}
              detail={sortedByEfficiency[0] ? `${sortedByEfficiency[0].pets} has the highest net per visit.` : "Add scheduled visits to compare efficiency."}
            />
          </div>
        </Panel>

        <Panel title="Payment mix" icon={PieChart}>
          <div className="space-y-3">
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
        </Panel>

        <Panel title="Weekly workload" icon={Clock}>
          <div className="space-y-2.5">
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
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Client rankings" icon={Crown}>
          <div className="space-y-3">
            {sortedByWeekly.slice(0, 5).map((item, index) => (
              <BarRow
                key={item.client.id}
                label={`${index + 1}. ${item.pets}`}
                value={`${formatCurrency(item.weeklyNet)} /wk`}
                detail={`${item.client.name} · ${formatCurrency(item.netPerVisit)} net/visit`}
                amount={item.weeklyNet}
                max={Math.max(1, sortedByWeekly[0]?.weeklyNet ?? 1)}
                accent={index === 0}
              />
            ))}
          </div>
        </Panel>

        <Panel title="Service mix" icon={BarChart3}>
          <div className="space-y-3">
            {serviceBreakdown.map((item) => (
              <BarRow
                key={item.service}
                label={`${item.service} · ${item.clients}`}
                value={formatCurrency(item.weeklyNet)}
                detail={`${item.visits} scheduled ${item.visits === 1 ? "visit" : "visits"}/week`}
                amount={item.weeklyNet}
                max={maxServiceWeekly}
              />
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}

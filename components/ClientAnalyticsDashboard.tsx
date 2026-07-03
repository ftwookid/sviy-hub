"use client";

import { Activity, CalendarDays, CircleDollarSign, Crown, ReceiptText, Users } from "lucide-react";
import { ClientMap } from "@/components/ClientMap";
import { cn } from "@/lib/cn";
import { estimateClientCurrentEarnings, selectedDaysFromRecord, WEEKS_PER_MONTH } from "@/lib/clients";
import { formatCurrency } from "@/lib/formatters";
import type { ClientPaymentMethod, ClientWithPets } from "@/types/client";

type ClientDashboardProps = {
  clients: ClientWithPets[];
};

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  emphasis?: boolean;
};

const PAYMENT_METHODS: ClientPaymentMethod[] = ["Rover", "Venmo", "Cash"];

function petNames(client: ClientWithPets) {
  return client.pets.map((pet) => pet.name || pet.type).join(", ") || "No pets listed";
}

function clientVisitDays(client: ClientWithPets) {
  return selectedDaysFromRecord(client.frequency_label, client.visits_per_week).length;
}

function MetricCard({ label, value, detail, icon: Icon, emphasis = false }: MetricCardProps) {
  return (
    <div className={cn("flex h-full flex-col justify-between rounded-[18px] border border-border bg-surface p-4 shadow-card", emphasis && "bg-[#FFFEFB]")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">{label}</div>
          <div className="mt-2 text-[24px] font-medium leading-none text-text-primary">{value}</div>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Icon size={18} strokeWidth={1.6} />
        </span>
      </div>
      <div className="mt-3 text-[13px] leading-snug text-text-secondary">{detail}</div>
    </div>
  );
}

export function ClientAnalyticsDashboard({ clients }: ClientDashboardProps) {
  const clientMetrics = clients.map((client) => {
    const estimate = estimateClientCurrentEarnings(client);
    return {
      client,
      weeklyNet: estimate.monthlyNet / WEEKS_PER_MONTH,
      monthlyNet: estimate.monthlyNet,
      annualNet: estimate.monthlyNet * 12,
      commission: estimate.commission,
      visitsPerWeek: clientVisitDays(client)
    };
  });

  const totals = clientMetrics.reduce(
    (nextTotals, item) => ({
      weeklyNet: nextTotals.weeklyNet + item.weeklyNet,
      monthlyNet: nextTotals.monthlyNet + item.monthlyNet,
      annualNet: nextTotals.annualNet + item.annualNet,
      commission: nextTotals.commission + item.commission,
      visitsPerWeek: nextTotals.visitsPerWeek + item.visitsPerWeek
    }),
    {
      weeklyNet: 0,
      monthlyNet: 0,
      annualNet: 0,
      commission: 0,
      visitsPerWeek: 0
    }
  );

  const topClient = clientMetrics.slice().sort((a, b) => b.weeklyNet - a.weeklyNet)[0] ?? null;
  const averageWeekly = clients.length > 0 ? totals.weeklyNet / clients.length : 0;
  const paymentBreakdown = PAYMENT_METHODS.map((method) => {
    const methodClients = clientMetrics.filter((item) => item.client.payment_method === method);
    const monthlyNet = methodClients.reduce((sum, item) => sum + item.monthlyNet, 0);
    const share = totals.monthlyNet > 0 ? Math.round((monthlyNet / totals.monthlyNet) * 100) : 0;
    return {
      method,
      count: methodClients.length,
      monthlyNet,
      share
    };
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-medium leading-tight text-text-primary">Client performance</h2>
        <p className="max-w-2xl text-[14px] text-text-secondary">
          Current prices, scheduled visits, payment mix, and client locations for the selected view.
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
            label="Rover fees"
            value={formatCurrency(totals.commission)}
            detail="Estimated monthly platform cost"
            icon={ReceiptText}
          />

          <div className="flex h-full flex-col rounded-[18px] border border-border bg-surface p-4 shadow-card">
            <div className="flex items-center gap-2 text-[14px] font-medium text-text-primary">
              <Crown size={16} strokeWidth={1.6} className="text-accent" />
              Top client
            </div>
            {topClient ? (
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <div className="mt-3 truncate text-[18px] font-medium leading-tight text-text-primary" title={petNames(topClient.client)}>
                    {petNames(topClient.client)}
                  </div>
                  <div className="mt-1 text-[13px] text-text-secondary">{topClient.client.name}</div>
                </div>
                <div className="mt-3 text-[15px] font-medium text-text-primary">{formatCurrency(topClient.weeklyNet)} /wk</div>
              </div>
            ) : (
              <div className="mt-3 text-[13px] text-text-secondary">No client income to rank yet.</div>
            )}
          </div>

          <div className="flex h-full flex-col rounded-[18px] border border-border bg-surface p-4 shadow-card">
            <div className="text-[14px] font-medium text-text-primary">Payment mix</div>
            <div className="mt-3 flex flex-1 flex-col justify-between gap-2.5">
              {paymentBreakdown.map((item) => (
                <div key={item.method}>
                  <div className="flex items-center justify-between gap-3 text-[12px] font-medium">
                    <span className="text-text-secondary">{item.method}</span>
                    <span className="text-text-tertiary">{item.share}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${item.share}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <ClientMap clients={clients} />
      </div>
    </section>
  );
}

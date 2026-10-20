"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { MonthPicker } from "@/components/expenses/MonthPicker";
import { AnchoredPanel } from "@/components/ui/AnchoredPanel";
import { cn } from "@/lib/cn";
import { bankTransactionTotals } from "@/lib/bankTransactions";
import { formatCurrency, formatShortDate } from "@/lib/formatters";
import {
  BANK_CATEGORIES,
  BANK_CATEGORY_SHORT,
  BANK_PROJECTS
} from "@/types/bankTransaction";
import type { BankCategory, BankProject, BankTransaction } from "@/types/bankTransaction";

/**
 * One month of posted bank transactions.
 *
 * The same shape as the month it sits beside: a divided strip of figures, then
 * the controls, then the rows, all in one card. Category and project are edited
 * on the row. Nothing else on a row is editable — the importer owns the rest.
 */

const ALL = "All";

type CategoryFilter = BankCategory | typeof ALL;
type ProjectFilter = BankProject | typeof ALL;

export function TransactionsPanel({
  periodMonth,
  onPeriodMonth,
  rows,
  onCategory,
  onProject
}: {
  periodMonth: string;
  onPeriodMonth: (next: string) => void;
  rows: BankTransaction[];
  onCategory: (row: BankTransaction, category: BankCategory) => void;
  onProject: (row: BankTransaction, project: BankProject) => void;
}) {
  const [category, setCategory] = useState<CategoryFilter>(ALL);
  const [project, setProject] = useState<ProjectFilter>(ALL);

  const inProject = project === ALL ? rows : rows.filter((row) => row.project === project);
  const inCategory = category === ALL ? rows : rows.filter((row) => row.category === category);
  const visible = rows.filter(
    (row) => (category === ALL || row.category === category) && (project === ALL || row.project === project)
  );
  const totals = bankTransactionTotals(visible);

  return (
    <section className="rounded-[20px] border border-border bg-surface shadow-card">
      <div className="grid h-[60px] grid-cols-3 divide-x divide-border/70">
        <Total label="Spent" value={totals.spent} />
        <Total label="Came in" value={totals.cameIn} />
        <Total
          label="Net"
          value={totals.net}
          tone={totals.net < 0 ? "bad" : totals.net > 0 ? "good" : "plain"}
          signed
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5 sm:flex-row sm:items-center">
        <div className="min-w-0 sm:w-[280px] sm:shrink-0">
          <MonthPicker periodMonth={periodMonth} onChange={onPeriodMonth} />
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          <ChoicePicker
            label="Category"
            allLabel="All categories"
            value={category}
            options={BANK_CATEGORIES.map((item) => ({
              value: item,
              label: item,
              short: BANK_CATEGORY_SHORT[item],
              count: inProject.filter((row) => row.category === item).length
            }))}
            allCount={inProject.length}
            onChange={setCategory}
          />
          <ChoicePicker
            label="Project"
            allLabel="All projects"
            value={project}
            options={BANK_PROJECTS.map((item) => ({
              value: item,
              label: item,
              short: item,
              count: inCategory.filter((row) => row.project === item).length
            }))}
            allCount={inCategory.length}
            onChange={setProject}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="border-t border-border px-3 py-6 text-center text-list text-text-secondary">
          {rows.length === 0 ? "No transactions this month." : "No transactions in this view."}
        </p>
      ) : (
        <ul>
          {visible.map((row) => (
            <li key={row.id} className="border-t border-border">
              <TransactionRow row={row} onCategory={onCategory} onProject={onProject} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Total({
  label,
  value,
  tone = "plain",
  signed = false
}: {
  label: string;
  value: number;
  tone?: "plain" | "good" | "bad";
  signed?: boolean;
}) {
  const shown = signed ? value : Math.abs(value);
  return (
    <div className="flex min-w-0 flex-col justify-center px-3">
      <div className="truncate text-micro font-medium uppercase tracking-[0.05em] text-text-tertiary">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-subhead font-medium leading-none tracking-[-0.01em]",
          tone === "bad" ? "text-danger" : tone === "good" ? "text-success" : "text-text-primary"
        )}
      >
        {formatCurrency(shown)}
      </div>
    </div>
  );
}

function TransactionRow({
  row,
  onCategory,
  onProject
}: {
  row: BankTransaction;
  onCategory: (row: BankTransaction, category: BankCategory) => void;
  onProject: (row: BankTransaction, project: BankProject) => void;
}) {
  const detail = [formatShortDate(row.date), row.account_label].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-start justify-between gap-3 sm:block">
        <div className="min-w-0">
          <div className="truncate text-body font-medium text-text-primary">{row.merchant || "Unknown"}</div>
          <div className="mt-0.5 truncate text-meta text-text-tertiary">{detail}</div>
          {row.notes ? <div className="mt-0.5 truncate text-meta text-text-secondary">{row.notes}</div> : null}
        </div>
        <Amount amount={row.amount} className="sm:hidden" />
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:shrink-0">
        <ChoicePicker
          label="Category"
          value={row.category}
          options={BANK_CATEGORIES.map((item) => ({
            value: item,
            label: item,
            short: BANK_CATEGORY_SHORT[item]
          }))}
          onChange={(next) => {
            if (next !== ALL) onCategory(row, next);
          }}
          className="sm:w-[168px]"
        />
        <ChoicePicker
          label="Project"
          value={row.project}
          options={BANK_PROJECTS.map((item) => ({
            value: item,
            label: item,
            short: item
          }))}
          onChange={(next) => {
            if (next !== ALL) onProject(row, next);
          }}
          className="sm:w-[156px]"
        />
      </div>

      <Amount amount={row.amount} className="hidden w-[96px] text-right sm:block" />
    </div>
  );
}

function Amount({ amount, className }: { amount: number; className?: string }) {
  const inflow = amount < 0;
  return (
    <span
      className={cn(
        "shrink-0 text-body font-medium tabular-nums",
        inflow ? "text-success" : "text-text-primary",
        className
      )}
    >
      {formatCurrency(Math.abs(amount))}
    </span>
  );
}

/**
 * A closed list, opened rather than cycled.
 *
 * The same control the month's bucket chip uses: the current value is painted
 * at rest, and the list carries a tick on the one that is set. `allLabel` adds
 * the "everything" row a filter needs; a row editor does not pass one.
 */
function ChoicePicker<T extends string>({
  label,
  allLabel,
  value,
  options,
  allCount,
  onChange,
  className
}: {
  label: string;
  allLabel?: string;
  value: T | typeof ALL;
  options: Array<{ value: T; label: string; short: string; count?: number }>;
  allCount?: number;
  onChange: (next: T | typeof ALL) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = value === ALL ? null : options.find((option) => option.value === value);
  const shown = current ? current.short : label;
  const filtering = Boolean(allLabel) && value !== ALL;

  return (
    <>
      <button
        ref={triggerRef}
        className={cn(
          "focus-ring inline-flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded-xl border px-2.5 text-left text-list font-medium transition-colors duration-200 ease-out",
          filtering
            ? "border-accent/45 bg-accent-soft text-text-primary"
            : "border-border bg-surface text-text-primary hover:bg-subtle",
          className
        )}
        type="button"
        aria-label={
          allLabel
            ? current
              ? `Showing ${current.label}. Change ${label.toLowerCase()}`
              : `${allLabel}. Change ${label.toLowerCase()}`
            : `${label}: ${current?.label ?? "not set"}. Change it`
        }
        aria-expanded={open}
        onClick={() => setOpen((next) => !next)}
      >
        <span className="min-w-0 flex-1 truncate">{shown}</span>
        <ChevronDown size={15} strokeWidth={2} className="shrink-0 text-text-tertiary" />
      </button>

      <AnchoredPanel anchorRef={triggerRef} open={open} onClose={() => setOpen(false)} width={280} className="p-1.5">
        {allLabel ? (
          <ChoiceOption
            label={allLabel}
            count={allCount}
            selected={value === ALL}
            onPick={() => {
              onChange(ALL);
              setOpen(false);
            }}
          />
        ) : null}
        {options.map((option) => (
          <ChoiceOption
            key={option.value}
            label={option.label}
            count={option.count}
            selected={option.value === value}
            onPick={() => {
              onChange(option.value);
              setOpen(false);
            }}
          />
        ))}
      </AnchoredPanel>
    </>
  );
}

function ChoiceOption({
  label,
  count,
  selected,
  onPick
}: {
  label: string;
  count?: number;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      className={cn(
        "focus-ring flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-body transition-colors duration-200 ease-out",
        selected ? "bg-accent-soft text-text-primary" : "text-text-secondary hover:bg-subtle"
      )}
      type="button"
      onClick={onPick}
    >
      <span className="min-w-0 truncate">
        {label}
        {count !== undefined ? <span className="ml-1.5 tabular-nums text-text-tertiary">{count}</span> : null}
      </span>
      {selected ? <Check size={15} strokeWidth={2} className="shrink-0" /> : null}
    </button>
  );
}

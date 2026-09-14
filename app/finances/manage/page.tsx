"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, Plus, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { HomesSection } from "@/components/finances/HomesSection";
import { AddEntryForm } from "@/components/finances/manage/AddEntryForm";
import { EntryList } from "@/components/finances/manage/EntryList";
import { FixedEditor } from "@/components/finances/manage/FixedEditor";
import { VariesEditor } from "@/components/finances/manage/VariesEditor";
import { ActionButton } from "@/components/finances/manage/controls";
import { currentPeriodMonth, periodMonthLabel } from "@/lib/expenses";
import { managedEntries, pendingBills } from "@/lib/financeEntries";
import {
  addFinanceHome,
  addFinanceLine,
  deleteFinanceHome,
  deleteFinanceLine,
  deleteFinanceRate,
  loadFinanceHomes,
  loadFinanceLines,
  moveFinanceLine,
  renameFinanceLine,
  setFinanceRate,
  updateFinanceHome,
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
import { formatCurrency, parseLocalDate } from "@/lib/formatters";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { ManagedEntry } from "@/lib/financeEntries";
import type { FinanceBucket, FinanceHome, FinanceLine, PayCadence } from "@/types/finance";
import type { UtilityAccount, UtilityBill, UtilityBucket } from "@/types/utility";

/**
 * Money in & out — where everything the household types in is entered.
 *
 * This replaces two dialogs. Setup held the standing figures and Utilities held
 * the metered bills, and the split between them was the storage layer showing
 * through: a person with a bill in their hand had to know which of the two
 * tables the app happened to keep it in before they could find the field to type
 * it into. Both then opened a panel over the month, and inside that panel the
 * figure they wanted was four levels down — bucket strip, row, expansion, form.
 *
 * Three decisions replace that:
 *
 * - **One screen, and a real one.** Not a dialog over the month. A dialog sets
 *   its width from the edge of the screen rather than from what is inside it, and
 *   it cannot hold a list beside an editor. A route can, and this screen is
 *   opened to *work* — to enter a month of bills, correct a raise, add a
 *   subscription — which is a job, not a glance. The cost of a route was named
 *   when Setup stopped being one: a page load and a fresh set of queries. That
 *   was the right trade when the panel was a glance at a figure; it is the wrong
 *   one now that it is the place all of this is done.
 *
 * - **One list, master-detail.** Every typed figure of both kinds in one list,
 *   grouped by the blocks the month reads in, with a search field over the lot.
 *   Picking one opens it beside the list on a desktop and over it on a phone.
 *   Nothing is nested more than one level deep.
 *
 * - **The distinction that survives is one a person can answer.** Not "standing
 *   figure or utility account" but "is the amount the same every month?" — which
 *   is asked once, when the thing is added, and is the only difference between
 *   the two editors afterwards. Nothing about the storage changed: `fixed` is a
 *   `finance_lines` row and `varies` is a `utility_accounts` row, exactly as
 *   before, so there is no migration behind any of this.
 */

/** What the detail column is showing. */
type Selection =
  | { kind: "entry"; key: string; focusMonth: string | null }
  | { kind: "add" }
  | { kind: "homes" }
  | null;

export default function ManageFinancesPage() {
  const { user, authLoading } = useAuthUser();
  const [lines, setLines] = useState<FinanceLine[]>([]);
  const [homes, setHomes] = useState<FinanceHome[]>([]);
  const [accounts, setAccounts] = useState<UtilityAccount[]>([]);
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [toast, setToast] = useState("");

  const [deletingLine, setDeletingLine] = useState<FinanceLine | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<UtilityAccount | null>(null);
  const [deletingBill, setDeletingBill] = useState<{ bill: UtilityBill; periodMonth: string } | null>(null);
  const [deletingHome, setDeletingHome] = useState<FinanceHome | null>(null);

  // The screen's own "now". Nothing here is scoped to the month the Finances
  // page happens to be sitting on: a bill that has not been entered is
  // outstanding today whichever month is being read behind it.
  const periodMonth = useMemo(() => currentPeriodMonth(), []);
  const pageYear = useMemo(() => parseLocalDate(periodMonth).getFullYear(), [periodMonth]);

  const refreshLines = useCallback(async () => {
    try {
      const { lines: next, setupNeeded, setupMessage } = await loadFinanceLines();
      setLines(next);
      return setupNeeded ? setupMessage : "";
    } catch (error) {
      setLines([]);
      return error instanceof Error ? error.message : "Could not load your figures";
    }
  }, []);

  const refreshHomes = useCallback(async () => {
    try {
      const { homes: next, setupNeeded, setupMessage } = await loadFinanceHomes();
      setHomes(next);
      return setupNeeded ? setupMessage : "";
    } catch (error) {
      setHomes([]);
      return error instanceof Error ? error.message : "Could not load your homes";
    }
  }, []);

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

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const notices = await Promise.all([refreshLines(), refreshUtilities(), refreshHomes()]);
    // One box, not three stacked: they are all "run this migration", and the
    // second and third cost more height than the sentence is worth.
    setNotice(notices.filter(Boolean).join(" "));
    setLoading(false);
  }, [refreshHomes, refreshLines, refreshUtilities, user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const book = useMemo(() => utilityBook(accounts, bills), [accounts, bills]);
  const entries = useMemo(() => managedEntries(lines, book, periodMonth), [book, lines, periodMonth]);
  const pending = useMemo(() => pendingBills(entries, periodMonth), [entries, periodMonth]);

  const selectedKey = selection?.kind === "entry" ? selection.key : null;
  const selected = useMemo(
    () => (selectedKey ? entries.find((entry) => entry.key === selectedKey) ?? null : null),
    [entries, selectedKey]
  );

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  /**
   * Every write goes through here: do it, re-read, say so.
   *
   * The list behind the editor is the same data the editor is changing, so a
   * save has to refresh it or the figure the reader just typed is not the one
   * the list prints.
   */
  async function run(action: () => Promise<void>, message: string, kind: "lines" | "utilities" | "homes") {
    try {
      await action();
      const next =
        kind === "lines" ? await refreshLines() : kind === "utilities" ? await refreshUtilities() : await refreshHomes();
      setNotice(next);
      showToast(message);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save that");
    }
  }

  function openBill(entry: ManagedEntry, month: string) {
    setSelection({ kind: "entry", key: entry.key, focusMonth: month });
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  const detailOpen = selection !== null;

  const detail = (() => {
    if (selection?.kind === "add") {
      return (
        <AddEntryForm
          onCancel={() => setSelection(null)}
          onAddFixed={(input) => {
            run(
              () =>
                addFinanceLine({
                  userId: user.id,
                  bucket: input.bucket,
                  label: input.label,
                  amount: input.amount,
                  cadence: input.cadence,
                  effectiveFrom: input.effectiveFrom,
                  effectiveTo: input.effectiveTo,
                  existingCount: lines.filter((line) => line.bucket === input.bucket).length
                }),
              `${input.label} added`,
              "lines"
            );
            setSelection(null);
          }}
          onAddVaries={(input) => {
            run(
              () =>
                addUtilityAccount({
                  userId: user.id,
                  name: input.name,
                  bucket: input.bucket as UtilityBucket,
                  existingCount: accounts.length
                }),
              `${input.name} added`,
              "utilities"
            );
            setSelection(null);
          }}
        />
      );
    }

    if (selection?.kind === "homes") {
      return (
        <HomesSection
          homes={homes}
          onAdd={({ name, movedIn }) =>
            run(() => addFinanceHome({ userId: user.id, name, movedIn }), `${name} added`, "homes")
          }
          onUpdate={({ id, name, movedIn }) =>
            run(() => updateFinanceHome({ id, name, movedIn }), "Home saved", "homes")
          }
          onDelete={setDeletingHome}
        />
      );
    }

    if (selected?.kind === "fixed" && selected.line) {
      const line = selected.line;
      return (
        <FixedEditor
          key={line.id}
          line={line}
          onRename={(label) => run(() => renameFinanceLine(line.id, label), "Renamed", "lines")}
          onMove={(bucket: FinanceBucket) =>
            run(() => moveFinanceLine(line.id, bucket), `Moved to ${bucket}`, "lines")
          }
          onSetRate={(effectiveFrom, amount, cadence, effectiveTo) =>
            run(
              () =>
                setFinanceRate({ userId: user.id, lineId: line.id, effectiveFrom, amount, cadence, effectiveTo }),
              "Change saved",
              "lines"
            )
          }
          onUpdateRate={(rateId, effectiveFrom, amount, cadence, effectiveTo) =>
            run(
              () => updateFinanceRate({ id: rateId, effectiveFrom, amount, cadence, effectiveTo }),
              effectiveTo ? "End date saved" : "Change updated",
              "lines"
            )
          }
          onDeleteRate={(rateId) => run(() => deleteFinanceRate(rateId), "Change removed", "lines")}
          onDelete={() => setDeletingLine(line)}
        />
      );
    }

    if (selected?.kind === "varies" && selected.utility) {
      const entry = selected.utility;
      return (
        <VariesEditor
          key={entry.account.id}
          entry={entry}
          pageYear={pageYear}
          focusMonth={selection?.kind === "entry" ? selection.focusMonth : null}
          onRename={(name) => run(() => updateUtilityAccount(entry.account.id, { name }), "Renamed", "utilities")}
          onMove={(bucket) =>
            run(() => updateUtilityAccount(entry.account.id, { bucket }), `Counted in ${bucket}`, "utilities")
          }
          onSetBill={(billMonth, amount) =>
            run(
              () =>
                setUtilityBill({
                  userId: user.id,
                  accountId: entry.account.id,
                  periodMonth: billMonth,
                  amount
                }),
              "Bill saved",
              "utilities"
            )
          }
          onDeleteBill={(bill, billMonth) => setDeletingBill({ bill, periodMonth: billMonth })}
          onDelete={() => setDeletingAccount(entry.account)}
        />
      );
    }

    return null;
  })();

  return (
    <AppShell user={user}>
      {/* Back, title, Add — one 44px row, the height every other section's title
          sits on. The back link is a real link rather than history.back(), so it
          lands on Finances however this screen was reached. */}
      <header className="mb-4 flex min-h-11 items-center gap-1">
        {detailOpen ? (
          <button
            // 44px of target, pulled back off the layout box so the header row
            // keeps the height every other section's title sits on.
            className="focus-ring -my-1.5 -ml-3 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-text-secondary transition-colors duration-200 ease-out hover:bg-subtle hover:text-text-primary lg:hidden"
            type="button"
            aria-label="Back to the list"
            onClick={() => setSelection(null)}
          >
            <ChevronLeft size={20} strokeWidth={1.8} />
          </button>
        ) : null}
        <Link
          href="/finances"
          aria-label="Back to Finances"
          className={cnHeaderBack(detailOpen)}
        >
          <ChevronLeft size={20} strokeWidth={1.8} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-figure-lg font-semibold leading-none tracking-[-0.01em] text-text-primary sm:text-display-sm">
          Money in &amp; out
        </h1>
        {selection?.kind === "add" ? (
          <ActionButton tone="quiet" onClick={() => setSelection(null)}>
            <X size={16} strokeWidth={1.9} />
            Cancel
          </ActionButton>
        ) : (
          <ActionButton tone="primary" onClick={() => setSelection({ kind: "add" })}>
            <Plus size={16} strokeWidth={2} />
            Add
          </ActionButton>
        )}
      </header>

      {notice ? (
        <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-warning/35 bg-warning-soft px-3.5 py-3 text-list text-text-primary">
          <AlertTriangle size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-warning" />
          <span>{notice}</span>
        </div>
      ) : null}

      {loading ? (
        <SkeletonRows />
      ) : (
        /* Master-detail: side by side where there is width, one at a time where
           there is not. A phone gets the list, and picking something replaces it
           — which is the same stage-rather-than-a-row move Health made, and it
           costs no permanent navigation either way. */
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
          <div className={detailOpen ? "hidden lg:block" : ""}>
            <EntryList
              entries={entries}
              pending={pending}
              nowYear={pageYear}
              query={query}
              selectedKey={selectedKey}
              homeCount={homes.length}
              homesSelected={selection?.kind === "homes"}
              onQuery={setQuery}
              onSelect={(entry) => setSelection({ kind: "entry", key: entry.key, focusMonth: null })}
              onOpenBill={openBill}
              onSelectHomes={() => setSelection({ kind: "homes" })}
            />
          </div>

          <div className={detailOpen ? "" : "hidden lg:block"}>
            {detail ?? (
              /* Nothing picked, on a desktop. The addresses stand here rather
                 than leaving the column empty: they are the one thing on this
                 screen with no month, no amount and no bucket, and a permanent
                 row for them in the list would charge every visit for a field
                 typed twice in a decade. */
              <>
                <p className="mb-3 rounded-[20px] border border-border bg-surface px-3.5 py-3 text-list text-text-secondary shadow-card sm:px-4">
                  Pick anything on the left to change what it costs, or add something new.
                </p>
                <HomesSection
                  homes={homes}
                  onAdd={({ name, movedIn }) =>
                    run(() => addFinanceHome({ userId: user.id, name, movedIn }), `${name} added`, "homes")
                  }
                  onUpdate={({ id, name, movedIn }) =>
                    run(() => updateFinanceHome({ id, name, movedIn }), "Home saved", "homes")
                  }
                  onDelete={setDeletingHome}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Deleting a line takes its whole dated history with it, which no other
          write here does — so this one asks, and names what goes. */}
      {deletingLine ? (
        <ConfirmDialog
          title={`Delete ${deletingLine.label}?`}
          description={
            deletingLine.rates.length > 1
              ? `Its ${deletingLine.rates.length} dated amounts go too. To stop it instead, give it an end date.`
              : "To stop it instead, give it an end date."
          }
          confirmLabel="Delete it"
          onCancel={() => setDeletingLine(null)}
          onConfirm={() => {
            const id = deletingLine.id;
            setDeletingLine(null);
            setSelection(null);
            run(() => deleteFinanceLine(id), "Line deleted", "lines");
          }}
        />
      ) : null}

      {deletingAccount ? (
        <ConfirmDialog
          title={`Delete ${deletingAccount.name}?`}
          description={(() => {
            const count = bills.filter((bill) => bill.account_id === deletingAccount.id).length;
            return count > 0
              ? `Its ${count} ${count === 1 ? "bill goes" : "bills go"} too, and the months they were in change.`
              : "Nothing has been billed against it yet.";
          })()}
          confirmLabel="Delete it"
          onCancel={() => setDeletingAccount(null)}
          onConfirm={() => {
            const id = deletingAccount.id;
            setDeletingAccount(null);
            setSelection(null);
            run(() => deleteUtilityAccount(id), "Deleted", "utilities");
          }}
        />
      ) : null}

      {/* A bill is a reading somebody took off a paper statement months ago, and
          the month cells are the control as well as the chart — so the finger
          that opened a month is already inside the grid the delete sits in. */}
      {deletingBill ? (
        <ConfirmDialog
          title={`Delete the ${periodMonthLabel(deletingBill.periodMonth)} bill?`}
          description={`${formatCurrency(deletingBill.bill.amount)} leaves that month, and the months with no bill of their own go back to being estimated.`}
          confirmLabel="Delete it"
          onCancel={() => setDeletingBill(null)}
          onConfirm={() => {
            const id = deletingBill.bill.id;
            setDeletingBill(null);
            run(() => deleteUtilityBill(id), "Bill removed", "utilities");
          }}
        />
      ) : null}

      {deletingHome ? (
        <ConfirmDialog
          title={`Delete ${deletingHome.name}?`}
          description="The bills stay. They stop being grouped under this address, so the By home comparison loses that side of it."
          confirmLabel="Delete it"
          onCancel={() => setDeletingHome(null)}
          onConfirm={() => {
            const id = deletingHome.id;
            setDeletingHome(null);
            run(() => deleteFinanceHome(id), "Home deleted", "homes");
          }}
        />
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}

/**
 * The way back to Finances.
 *
 * On a phone, with a detail open, the row already carries a back arrow that
 * returns to the list — two identical arrows side by side would be a coin toss —
 * so this one stands down until the list is what is on screen.
 */
function cnHeaderBack(detailOpen: boolean) {
  return [
    "focus-ring -my-1.5 -ml-3 h-11 w-11 shrink-0 place-items-center rounded-xl text-text-secondary transition-colors duration-200 ease-out hover:bg-subtle hover:text-text-primary",
    detailOpen ? "hidden lg:grid" : "grid"
  ].join(" ");
}

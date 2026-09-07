"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, HeartHandshake, Home, PauseCircle, Plus, UsersRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ClientCard } from "@/components/ClientCard";
import { ClientAnalyticsDashboard } from "@/components/ClientAnalyticsDashboard";
import { ClientIncomeSummary } from "@/components/ClientIncomeSummary";
import { ClientForm } from "@/components/ClientForm";
import { ClientFilterMenu } from "@/components/clients/ClientFilterMenu";
import { HouseSittingDashboard } from "@/components/HouseSittingDashboard";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { CloseButton } from "@/components/ui/CloseButton";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { estimateClientMonthlyNet } from "@/lib/clients";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import { labelFor, loadUserLabels } from "@/lib/userLabels";
import type { ClientStatus, ClientWithPets } from "@/types/client";

type ClientFilter = ClientStatus | "All";
type ClientView = "performance" | "regular" | "house-sitting";

/**
 * `short` is what a 115px phone cell can hold on one line.
 *
 * "Regular customers" and "House Sitting" wrapped to two lines at 390px, which
 * made the tab row 16px taller than it needed to be — before the second row of
 * navigation underneath it was even counted. The full words are back from `sm`,
 * where there is room for them.
 */
const clientViews: Array<{
  id: ClientView;
  label: string;
  short: string;
  icon: typeof BarChart3;
}> = [
  {
    id: "performance",
    label: "Performance",
    short: "Performance",
    icon: BarChart3
  },
  {
    id: "regular",
    label: "Regular customers",
    short: "Customers",
    icon: UsersRound
  },
  {
    id: "house-sitting",
    label: "House Sitting",
    short: "Sitting",
    icon: Home
  }
];

function getClientView(value: string | null): ClientView {
  if (value === "regular" || value === "house-sitting") return value;
  return "performance";
}

export default function ClientsPage() {
  return (
    <Suspense fallback={<AppLoading message="Loading clients..." />}>
      <ClientsPageContent />
    </Suspense>
  );
}

function ClientsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, authLoading } = useAuthUser();
  const [clients, setClients] = useState<ClientWithPets[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ClientFilter>("Active");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientWithPets | null>(null);
  const [ownerLabels, setOwnerLabels] = useState<Record<string, string>>({});

  const loadClients = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    const { data } = await supabase
      .from("clients")
      .select("*, pets(*), price_history(*)")
      .order("name", { ascending: true });

    const nextClients = ((data ?? []) as Array<ClientWithPets & { pets: ClientWithPets["pets"] | null }>).map(
      (client) => ({ ...client, pets: client.pets ?? [], price_history: client.price_history ?? [] })
    );

    // Both people's clients are in one list now, so every card says whose it is.
    setOwnerLabels(nextClients.length > 0 ? await loadUserLabels() : {});

    setClients(nextClients);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const counts = useMemo(
    () => ({
      Active: clients.filter((client) => client.status === "Active").length,
      Paused: clients.filter((client) => client.status === "Paused").length,
      All: clients.length
    }),
    [clients]
  );

  const filteredClients = useMemo(() => {
    const nextClients = clients.filter((client) => filter === "All" || client.status === filter);

    return nextClients.slice().sort((a, b) => {
      const incomeDiff = estimateClientMonthlyNet(b) - estimateClientMonthlyNet(a);
      if (incomeDiff !== 0) return incomeDiff;
      if (a.status !== b.status) return a.status === "Active" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [clients, filter]);

  const activeView = getClientView(searchParams.get("view"));
  function changeClientView(view: ClientView) {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (view === "performance") {
      nextParams.delete("view");
    } else {
      nextParams.set("view", view);
    }

    const query = nextParams.toString();
    router.replace(query ? `/clients?${query}` : "/clients", { scroll: false });
  }

  useEscapeKey(closeEditor, editorOpen);

  function openNewClient() {
    setEditingClient(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingClient(null);
  }

  async function deleteClient(client: ClientWithPets) {
    if (!supabase) return;
    const confirmed = window.confirm(`Delete ${client.name}? This will also remove their pets.`);
    if (!confirmed) return;

    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) {
      window.alert(error.message);
      return;
    }

    loadClients();
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      <PageHeader
        title="Clients"
        action={
          <div className="flex min-h-11 items-center justify-end gap-2">
            {/* House sitting has its own stays, not a client list, so the filter
                is not rendered there rather than sitting inert. */}
            {activeView !== "house-sitting" ? (
              <ClientFilterMenu value={filter} counts={counts} onChange={setFilter} />
            ) : null}
            <div className="hidden min-w-[132px] justify-end sm:flex">
              <Button
                className={cn("transition-opacity", activeView === "house-sitting" && "pointer-events-none opacity-0")}
                variant="accent"
                onClick={openNewClient}
                aria-hidden={activeView === "house-sitting"}
                tabIndex={activeView === "house-sitting" ? -1 : 0}
              >
                <Plus size={18} strokeWidth={1.6} />
                Add client
              </Button>
            </div>
          </div>
        }
      />
      <div className="space-y-5">
        {/* One row, at every width. This was two stacked segmented rows — the
            single thing the space rules say never to do — costing 108px of an
            844px phone screen, and staying stacked all the way through tablet
            because they only sat side by side at `lg`. The filter is a chip in
            the header now; what is left is navigation, which is what a row is
            for. */}
        <div>
          <nav
            className="grid min-h-11 grid-cols-3 rounded-2xl border border-border bg-subtle p-1 lg:w-fit"
            aria-label="Client sections"
          >
            {clientViews.map((view) => {
              const Icon = view.icon;
              const selected = activeView === view.id;
              return (
                <button
                  key={view.id}
                  className={cn(
                    "focus-ring flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-center text-meta font-medium leading-tight transition duration-150 ease-out sm:min-h-9 sm:px-3 sm:text-body",
                    selected ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
                  )}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => changeClientView(view.id)}
                >
                  {/* Not on a phone. Beside a text label the icon says nothing the
                      word does not, and it was taking 22px of a ~103px cell —
                      enough to truncate the selected tab to "Performan…". */}
                  <Icon
                    size={16}
                    strokeWidth={1.6}
                    className={cn("hidden sm:block", selected ? "text-accent" : "text-text-tertiary")}
                  />
                  <span className="truncate sm:hidden">{view.short}</span>
                  <span className="hidden truncate sm:inline">{view.label}</span>
                </button>
              );
            })}
          </nav>

        </div>

        {activeView === "house-sitting" ? (
          <HouseSittingDashboard userId={user.id} regularClients={clients} />
        ) : null}

        {activeView !== "house-sitting" && loading ? <SkeletonRows /> : null}

        {activeView !== "house-sitting" && !loading && filteredClients.length === 0 ? (
          filter === "Paused" ? (
            <section className="rounded-[24px] border border-border bg-surface px-6 py-14 text-center shadow-card">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-subtle">
                <PauseCircle size={28} strokeWidth={1.5} className="text-text-tertiary" />
              </div>
              <h2 className="mt-5 text-figure-lg font-medium text-text-primary">No paused clients</h2>
              <p className="mx-auto mt-2 max-w-sm text-label text-text-secondary">
                Clients only show here after they are paused from an existing profile.
              </p>
            </section>
          ) : (
            <section className="rounded-[24px] border border-border bg-surface px-6 py-16 text-center shadow-card">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] bg-accent-soft">
                <HeartHandshake size={32} strokeWidth={1.5} className="text-accent" />
              </div>
              <h2 className="mt-5 text-figure-lg font-medium text-text-primary">No clients here yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-label text-text-secondary">
                Add your first client and the hub will start estimating visits, taxes, and monthly income.
              </p>
              <Button className="mt-6" variant="accent" onClick={openNewClient}>
                <Plus size={18} strokeWidth={1.6} />
                Add client
              </Button>
            </section>
          )
        ) : null}

        {activeView === "performance" && !loading && filteredClients.length > 0 ? (
          <ClientAnalyticsDashboard clients={filteredClients} />
        ) : null}

        {activeView === "regular" && !loading && filteredClients.length > 0 ? (
          <ClientIncomeSummary clients={filteredClients} />
        ) : null}

        {activeView === "regular" && !loading && filteredClients.length > 0 ? (
          <section className="grid gap-4 lg:grid-cols-2">
            {filteredClients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                ownerLabel={labelFor(ownerLabels, client.user_id)}
                onDelete={client.status === "Paused" ? () => deleteClient(client) : undefined}
                onClick={() => router.push(`/clients/${client.id}`)}
              />
            ))}
          </section>
        ) : null}
      </div>

      {activeView !== "house-sitting" ? (
        <Button
          className="fixed bottom-[calc(104px+env(safe-area-inset-bottom))] right-5 z-40 h-14 w-14 rounded-full p-0 shadow-[0_18px_44px_rgba(140,104,39,0.25)] sm:hidden"
          variant="accent"
          onClick={openNewClient}
          aria-label="Add client"
        >
          <Plus size={24} strokeWidth={1.6} />
        </Button>
      ) : null}

      {editorOpen ? (
        <div className="fixed inset-0 z-[60] bg-[#1A1916]/20 backdrop-blur-sm" onClick={closeEditor}>
          <aside
            className="slide-over-panel ml-auto flex h-full w-full max-w-[620px] flex-col overflow-y-auto bg-page p-4 shadow-[0_20px_70px_rgba(48,38,24,0.18)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-display-sm font-medium leading-[1.1] tracking-[-0.01em] text-text-primary">
                  {editingClient ? "Edit client" : "Add client"}
                </h2>
                <p className="mt-1 text-label text-text-secondary">Keep the details light, useful, and easy to scan.</p>
              </div>
              <CloseButton onClick={closeEditor} />
            </div>
            <ClientForm
              key={editingClient?.id ?? "new"}
              userId={user.id}
              client={editingClient}
              canChangeOwner
              onCancel={closeEditor}
              onSaved={() => {
                closeEditor();
                loadClients();
              }}
            />
          </aside>
        </div>
      ) : null}
    </AppShell>
  );
}

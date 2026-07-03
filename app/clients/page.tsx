"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HeartHandshake, PauseCircle, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ClientCard } from "@/components/ClientCard";
import { ClientForm } from "@/components/ClientForm";
import { ClientMap } from "@/components/ClientMap";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { estimateClientMonthlyNet } from "@/lib/clients";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import type { ClientStatus, ClientWithPets } from "@/types/client";

type ClientFilter = ClientStatus | "All";

export default function ClientsPage() {
  const router = useRouter();
  const { user, isAdmin, authLoading } = useAuthUser();
  const [clients, setClients] = useState<ClientWithPets[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ClientFilter>("Active");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientWithPets | null>(null);
  const [ownerLabels, setOwnerLabels] = useState<Record<string, string>>({});

  const loadClients = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    let query = supabase
      .from("clients")
      .select("*, pets(*), price_history(*)")
      .order("name", { ascending: true });

    if (!isAdmin) query = query.eq("user_id", user.id);

    const { data } = await query;

    const nextClients = ((data ?? []) as Array<ClientWithPets & { pets: ClientWithPets["pets"] | null }>).map(
      (client) => ({ ...client, pets: client.pets ?? [], price_history: client.price_history ?? [] })
    );

    if (isAdmin && nextClients.length > 0) {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const userIds = Array.from(new Set(nextClients.map((client) => client.user_id)));

      if (session?.access_token) {
        try {
          const response = await fetch("/api/admin/user-labels", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ userIds })
          });

          if (response.ok) {
            const body = (await response.json()) as { labels?: Record<string, string> };
            setOwnerLabels(body.labels ?? {});
          } else {
            setOwnerLabels({});
          }
        } catch {
          setOwnerLabels({});
        }
      } else {
        setOwnerLabels({});
      }
    } else {
      setOwnerLabels({});
    }

    setClients(nextClients);
    setLoading(false);
  }, [isAdmin, user]);

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

  function openNewClient() {
    setEditingClient(null);
    setEditorOpen(true);
  }

  function openExistingClient(client: ClientWithPets) {
    setEditingClient(client);
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
      <div className="space-y-7">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[38px] font-medium leading-[1.06] tracking-[-0.01em] text-text-primary">Clients</h1>
            <p className="mt-2 max-w-xl text-[16px] text-text-secondary">
              People, pets, routines, and earnings in one soft little command center.
            </p>
          </div>
          <Button className="hidden sm:inline-flex" variant="accent" onClick={openNewClient}>
            <Plus size={18} strokeWidth={1.6} />
            Add client
          </Button>
        </header>

        <div className="inline-grid min-h-11 grid-cols-3 rounded-2xl border border-border bg-subtle p-1">
          {(["Active", "Paused", "All"] as ClientFilter[]).map((item) => (
            <button
              key={item}
              className={cn(
                "min-h-9 rounded-xl px-3 text-[14px] font-medium transition duration-150 ease-out",
                filter === item ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary"
              )}
              type="button"
              onClick={() => setFilter(item)}
            >
              {item} {counts[item]}
            </button>
          ))}
        </div>

        {loading ? <SkeletonRows /> : null}

        {!loading && filteredClients.length === 0 ? (
          filter === "Paused" ? (
            <section className="rounded-[24px] border border-border bg-surface px-6 py-14 text-center shadow-card">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-subtle">
                <PauseCircle size={28} strokeWidth={1.5} className="text-text-tertiary" />
              </div>
              <h2 className="mt-5 text-[22px] font-medium text-text-primary">No paused clients</h2>
              <p className="mx-auto mt-2 max-w-sm text-[15px] text-text-secondary">
                Clients only show here after they are paused from an existing profile.
              </p>
            </section>
          ) : (
            <section className="rounded-[24px] border border-border bg-surface px-6 py-16 text-center shadow-card">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] bg-accent-soft">
                <HeartHandshake size={32} strokeWidth={1.5} className="text-accent" />
              </div>
              <h2 className="mt-5 text-[22px] font-medium text-text-primary">No clients here yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-[15px] text-text-secondary">
                Add your first client and the hub will start estimating visits, taxes, and monthly income.
              </p>
              <Button className="mt-6" variant="accent" onClick={openNewClient}>
                <Plus size={18} strokeWidth={1.6} />
                Add client
              </Button>
            </section>
          )
        ) : null}

        {!loading && filteredClients.length > 0 ? (
          <>
            <ClientMap clients={filteredClients} />

            <section className="grid gap-4 lg:grid-cols-2">
              {filteredClients.map((client) => (
                <ClientCard
                  key={client.id}
                  client={client}
                  ownerLabel={isAdmin ? ownerLabels[client.user_id] ?? `User ${client.user_id.slice(0, 8)}` : undefined}
                  onDelete={isAdmin && client.status === "Paused" ? () => deleteClient(client) : undefined}
                  onClick={() => router.push(`/clients/${client.id}`)}
                />
              ))}
            </section>
          </>
        ) : null}
      </div>

      <Button
        className="fixed bottom-[calc(104px+env(safe-area-inset-bottom))] right-5 z-40 h-14 w-14 rounded-full p-0 shadow-[0_18px_44px_rgba(140,104,39,0.25)] sm:hidden"
        variant="accent"
        onClick={openNewClient}
        aria-label="Add client"
      >
        <Plus size={24} strokeWidth={1.6} />
      </Button>

      {editorOpen ? (
        <div className="fixed inset-0 z-[60] bg-[#1A1916]/20 backdrop-blur-sm" onClick={closeEditor}>
          <aside
            className="slide-over-panel ml-auto flex h-full w-full max-w-[620px] flex-col overflow-y-auto bg-page p-4 shadow-[0_20px_70px_rgba(48,38,24,0.18)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-text-primary">
                  {editingClient ? "Edit client" : "Add client"}
                </h2>
                <p className="mt-1 text-[15px] text-text-secondary">Keep the details light, useful, and easy to scan.</p>
              </div>
              <Button variant="ghost" onClick={closeEditor} aria-label="Close">
                <X size={20} strokeWidth={1.6} />
              </Button>
            </div>
            <ClientForm
              key={editingClient?.id ?? "new"}
              userId={user.id}
              client={editingClient}
              canChangeOwner={isAdmin}
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

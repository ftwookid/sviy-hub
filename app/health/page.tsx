"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { BodyPanel } from "@/components/health/BodyPanel";
import { FatlossPanel } from "@/components/health/FatlossPanel";
import { WeightPanel } from "@/components/health/WeightPanel";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { isMissingTable, loadHealthEntries, loadHealthProfiles } from "@/lib/health";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import { loadUsers, type UserOption } from "@/lib/userLabels";
import type { HealthEntry, HealthProfile } from "@/types/health";

const SECTIONS = [
  { key: "body", label: "Body" },
  { key: "weight", label: "Weight" },
  { key: "fatloss", label: "Fatloss" }
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

/**
 * Owner labels elsewhere carry the whole nickname — "Ivan K. (Admin)" — because
 * they answer "whose row is this" in a list. A tab is a person, so it gets the
 * name they are called by and nothing else.
 */
function firstName(label: string) {
  return label.split(/[\s(]/)[0].replace(/[^A-Za-zÀ-ÿ0-9'-]/g, "") || label;
}

function Segmented<T extends string>({
  options,
  value,
  onChange
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div
      className="grid gap-0.5 rounded-xl border border-border bg-subtle p-0.5"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(option.key)}
            className={cn(
              "focus-ring flex min-h-9 items-center justify-center rounded-[10px] px-2 text-[13px] font-medium transition duration-150 ease-out",
              active ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default function HealthPage() {
  const { user, authLoading } = useAuthUser();
  const [people, setPeople] = useState<UserOption[]>([]);
  const [personId, setPersonId] = useState("");
  const [section, setSection] = useState<SectionKey>("body");
  const [profiles, setProfiles] = useState<HealthProfile[]>([]);
  const [entries, setEntries] = useState<HealthEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    let active = true;
    loadUsers().then((users) => {
      if (active) setPeople(users);
    });
    return () => {
      active = false;
    };
  }, []);

  // Everyone who has signed in gets a tab, with the reader's own first: a body
  // is read about far more often than it is compared.
  const orderedPeople = useMemo(() => {
    if (!user) return people;
    const mine = people.filter((person) => person.id === user.id);
    const others = people.filter((person) => person.id !== user.id);
    return [...mine, ...others];
  }, [people, user]);

  useEffect(() => {
    if (personId || !orderedPeople.length) return;
    setPersonId(orderedPeople[0].id);
  }, [orderedPeople, personId]);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setSchemaError("");

    const [{ profiles: nextProfiles, error: profileError }, { entries: nextEntries, error: entryError }] =
      await Promise.all([loadHealthProfiles(), loadHealthEntries()]);

    const failure = profileError ?? entryError;
    if (failure) {
      setSchemaError(failure.message);
      setLoading(false);
      return;
    }

    setProfiles(nextProfiles);
    setEntries(nextEntries);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const personProfile = useMemo(
    () => profiles.find((profile) => profile.person_id === personId) ?? null,
    [profiles, personId]
  );
  const personEntries = useMemo(() => entries.filter((entry) => entry.person_id === personId), [entries, personId]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function onSaved(message: string) {
    flash(message);
    load();
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      <div className="space-y-4">
        <div className="space-y-2">
          {orderedPeople.length ? (
            <Segmented
              options={orderedPeople.map((person) => ({ key: person.id, label: firstName(person.label) }))}
              value={personId}
              onChange={setPersonId}
            />
          ) : null}
          <Segmented options={SECTIONS.map((item) => ({ ...item }))} value={section} onChange={setSection} />
        </div>

        {schemaError ? (
          <section className="rounded-[16px] border border-warning/20 bg-warning-soft p-3">
            <p className="text-[13px] text-text-secondary">
              {isMissingTable(schemaError) ? (
                <>
                  Run <code className="rounded bg-white/70 px-1.5 py-0.5">supabase/health-schema.sql</code> in Supabase,
                  then refresh.
                </>
              ) : (
                "Health could not be loaded."
              )}
            </p>
            <p className="mt-1.5 text-[11px] text-warning">{schemaError}</p>
          </section>
        ) : loading ? (
          <SkeletonRows />
        ) : !personId ? (
          <p className="text-[13px] text-text-secondary">No people to show yet.</p>
        ) : section === "body" ? (
          <BodyPanel
            personId={personId}
            loggedBy={user.id}
            profile={personProfile}
            entries={personEntries}
            onSaved={onSaved}
            onError={flash}
          />
        ) : section === "weight" ? (
          <WeightPanel
            personId={personId}
            loggedBy={user.id}
            entries={personEntries}
            onSaved={onSaved}
            onError={flash}
          />
        ) : (
          <FatlossPanel
            personId={personId}
            profile={personProfile}
            entries={personEntries}
            onSaved={onSaved}
            onError={flash}
          />
        )}
      </div>

      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}

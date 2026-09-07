"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { AppLoading, SetupNotice } from "@/components/SetupNotice";
import { BodyDetail } from "@/components/health/BodyDetail";
import { GoalDetail } from "@/components/health/GoalDetail";
import { LogSheet } from "@/components/health/LogSheet";
import { DetailHeader, Card, Ring, Tile } from "@/components/health/primitives";
import { TodayCard } from "@/components/health/TodayCard";
import { WeightDetail } from "@/components/health/WeightDetail";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { todayInputValue } from "@/lib/formatters";
import {
  bmi,
  bmiBand,
  first,
  goalProgress,
  isMissingTable,
  latest,
  loadHealthEntries,
  loadHealthProfiles,
  previous
} from "@/lib/health";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuthUser } from "@/lib/useAuthUser";
import { loadUsers, type UserOption } from "@/lib/userLabels";
import type { HealthEntry, HealthProfile } from "@/types/health";

type View = "overview" | "weight" | "body" | "goal";

const TITLES: Record<Exclude<View, "overview">, string> = {
  weight: "Weight",
  body: "Body",
  goal: "Goal"
};

/**
 * Owner labels elsewhere carry the whole nickname — "Ivan K. (Admin)" — because
 * they answer "whose row is this" in a list. Here it names a person, so it is
 * the name they are called by and nothing else.
 */
function firstName(label: string) {
  return label.split(/[\s(]/)[0].replace(/[^A-Za-zÀ-ÿ0-9'-]/g, "") || label;
}

/**
 * Health, arranged around what actually happens here.
 *
 * Nearly every visit is one action — type this morning's weight — and almost
 * none of the rest repeat. So the page is not a set of tabs to choose between
 * before anything can be done; it is the weigh-in itself, the trend under it,
 * and two tiles that open the long answers on demand:
 *
 *   overview  →  today's number, the 14-day line, Goal and Body
 *   tap a tile →  that subject in full, back arrow to return
 *   tap ＋     →  the whole reading (tape, body fat, an older date) in a sheet
 *
 * That leaves no permanent navigation on screen at all. The tabbed version
 * spent two rows asking which of three pages you wanted before showing a single
 * figure — a question the reader answers the same way nine times out of ten.
 */
export default function HealthPage() {
  const { user, authLoading } = useAuthUser();
  const [people, setPeople] = useState<UserOption[]>([]);
  const [personId, setPersonId] = useState("");
  const [view, setView] = useState<View>("overview");
  const [profiles, setProfiles] = useState<HealthProfile[]>([]);
  const [entries, setEntries] = useState<HealthEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [toast, setToast] = useState("");
  const today = todayInputValue();

  useEffect(() => {
    let active = true;
    loadUsers().then((users) => {
      if (active) setPeople(users);
    });
    return () => {
      active = false;
    };
  }, []);

  // The reader's own body first: it is the one being logged, not compared.
  const orderedPeople = useMemo(() => {
    if (!user) return people;
    return [...people.filter((person) => person.id === user.id), ...people.filter((person) => person.id !== user.id)];
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
  const person = orderedPeople.find((candidate) => candidate.id === personId) ?? null;
  const viewingOther = Boolean(person && user && person.id !== user.id);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function onSaved(message: string) {
    flash(message);
    load();
  }

  const currentWeight = latest(personEntries, "weight_lb");
  const goal = personProfile?.goal_weight_lb ?? null;
  const toGo = currentWeight && goal != null ? currentWeight.value - goal : null;
  const progress = goalProgress(first(personEntries, "weight_lb")?.value ?? null, currentWeight?.value ?? null, goal);
  const bmiValue = bmi(currentWeight?.value ?? null, personProfile?.height_in ?? null);
  const waist = latest(personEntries, "waist_in");
  const waistBefore = previous(personEntries, "waist_in");
  const waistChange = waist && waistBefore ? waist.value - waistBefore.value : null;

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading || !user) return <AppLoading message="Checking your session..." />;

  return (
    <AppShell user={user}>
      {/* A drill-down brings its own back header, so the section title steps
          aside rather than stacking a second row on top of it. Both occupy the
          same slot above the content, so nothing below them shifts. */}
      {view === "overview" ? (
        <PageHeader title="Health" />
      ) : (
        <DetailHeader
          title={viewingOther && person ? `${firstName(person.label)} · ${TITLES[view]}` : TITLES[view]}
          onBack={() => setView("overview")}
        />
      )}
      <div className="space-y-3">
        {schemaError ? (
          <section className="rounded-[16px] border border-warning/20 bg-warning-soft p-3">
            <p className="text-list text-text-secondary">
              {isMissingTable(schemaError) ? (
                <>
                  Run <code className="rounded bg-white/70 px-1.5 py-0.5">supabase/health-schema.sql</code> in Supabase,
                  then refresh.
                </>
              ) : (
                "Health could not be loaded."
              )}
            </p>
            <p className="mt-1.5 text-caption text-warning">{schemaError}</p>
          </section>
        ) : loading || !personId ? (
          <SkeletonRows />
        ) : view === "overview" ? (
          <>
            <TodayCard
              personId={personId}
              loggedBy={user.id}
              today={today}
              entries={personEntries}
              people={orderedPeople.map((candidate) => ({ id: candidate.id, label: firstName(candidate.label) }))}
              personLabel={viewingOther && person ? firstName(person.label) : null}
              onSelectPerson={setPersonId}
              onSaved={onSaved}
              onError={flash}
              onOpenHistory={() => setView("weight")}
              onOpenLog={() => setLogOpen(true)}
            />

            {/* Two questions worth a glance, each opening its own full view.
                No tile exists for its own sake — two honest ones beat three. */}
            <Card className="grid grid-cols-2 divide-x divide-border">
              <Tile
                label="Goal"
                value={toGo != null ? `${Math.max(0, toGo).toFixed(1)} lb` : "Set one"}
                detail={
                  progress != null
                    ? `${Math.round(progress * 100)}% of the way`
                    : goal != null
                      ? `Goal ${goal} lb`
                      : undefined
                }
                tone={toGo != null && toGo <= 0 ? "good" : undefined}
                accessory={progress != null ? <Ring progress={progress} /> : undefined}
                onClick={() => setView("goal")}
              />
              <Tile
                label="Body"
                value={bmiValue ? bmiValue.toFixed(1) : waist ? `${waist.value.toFixed(1)}"` : "Measure"}
                detail={
                  bmiValue
                    ? waistChange != null
                      ? `${bmiBand(bmiValue)} · waist ${waistChange < 0 ? "−" : "+"}${Math.abs(waistChange).toFixed(1)}"`
                      : bmiBand(bmiValue)
                    : waist
                      ? "Waist"
                      : undefined
                }
                onClick={() => setView("body")}
              />
            </Card>
          </>
        ) : (
          <>
            {view === "weight" ? (
              <WeightDetail entries={personEntries} onSaved={onSaved} onError={flash} />
            ) : view === "body" ? (
              <BodyDetail
                personId={personId}
                profile={personProfile}
                entries={personEntries}
                onSaved={onSaved}
                onError={flash}
              />
            ) : (
              <GoalDetail
                personId={personId}
                profile={personProfile}
                entries={personEntries}
                onSaved={onSaved}
                onError={flash}
              />
            )}
          </>
        )}
      </div>

      {logOpen ? (
        <LogSheet
          personId={personId}
          loggedBy={user.id}
          onClose={() => setLogOpen(false)}
          onSaved={onSaved}
          onError={flash}
        />
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}

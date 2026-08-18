import { supabase } from "@/lib/supabase";
import type { MileageTrip, MileageUpload } from "@/types/mileage";

const TRIP_PAGE_SIZE = 1000;

export function dateFromTimestamp(value: string) {
  return new Date(value.length === 10 ? `${value}T12:00:00` : value);
}

export function dateKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

export function shortMonth(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

export function monthsBetween(start: Date, end: Date) {
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  const months: Date[] = [];
  while (cursor <= last) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export function daysBetween(start: Date, end: Date) {
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const days: Date[] = [];
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * A stop address is a full postal line; what makes a list readable is the part
 * that names the place. Everything that is true of every row — the state, the
 * zip, "Portland" on its own — carries no information, so it is dropped.
 */
export function destinationArea(value: string | null) {
  if (!value?.trim()) return "Area not named";
  const pieces = value
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean);
  const neighborhood = /\b(?:northwest|southwest|northeast|southeast|north|south|east|west)\s+portland\b/i;
  const named = pieces.find((piece) => neighborhood.test(piece));
  if (named) return named;

  const candidates = pieces.filter((piece) => {
    if (/^(?:usa|united states)$/i.test(piece)) return false;
    if (/^\d{5}(?:-\d{4})?$/.test(piece)) return false;
    if (/^[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i.test(piece)) return false;
    if (/^(?:oregon|washington)(?:\s+\d{5}(?:-\d{4})?)?$/i.test(piece)) return false;
    if (/^portland(?:\s+(?:or|oregon))?(?:\s+\d{5}(?:-\d{4})?)?$/i.test(piece)) return false;
    if (/^\d+\s/.test(piece)) return false;
    return true;
  });

  return candidates[0] ?? pieces.find((piece) => !/\d{5}/.test(piece)) ?? "Area not named";
}

export type MileageScope = {
  userId: string;
  isAdmin: boolean;
  ownerId: string;
};

export async function loadMileageUploads({ userId, isAdmin, ownerId }: MileageScope) {
  if (!supabase) return { uploads: [] as MileageUpload[], error: null as { message: string } | null };

  let query = supabase
    .from("mileage_uploads")
    .select("*")
    .order("period_month", { ascending: false })
    .order("uploaded_at", { ascending: false });

  if (!isAdmin) query = query.eq("user_id", userId);
  else if (ownerId !== "all") query = query.eq("user_id", ownerId);

  const { data, error } = await query;
  if (error) return { uploads: [], error };
  return { uploads: (data ?? []) as MileageUpload[], error: null };
}

export async function loadMileageTrips(scope: MileageScope, activeUploadIds: string[]) {
  if (!supabase || activeUploadIds.length === 0) {
    return { trips: [] as MileageTrip[], error: null as { message: string } | null };
  }

  const trips: MileageTrip[] = [];
  let from = 0;

  // Supabase caps a select at 1000 rows, and a year of driving runs well past
  // that — paging is what keeps a yearly total from silently truncating.
  for (;;) {
    let query = supabase
      .from("mileage_trips")
      .select("*")
      .in("upload_id", activeUploadIds)
      .order("start_at", { ascending: false })
      .range(from, from + TRIP_PAGE_SIZE - 1);

    if (!scope.isAdmin) query = query.eq("user_id", scope.userId);
    else if (scope.ownerId !== "all") query = query.eq("user_id", scope.ownerId);

    const { data, error } = await query;
    if (error) return { trips: [], error };

    const page = (data ?? []) as MileageTrip[];
    trips.push(...page);
    if (page.length < TRIP_PAGE_SIZE) return { trips, error: null };
    from += TRIP_PAGE_SIZE;
  }
}

export type MileageTotals = {
  miles: number;
  deduction: number;
  trips: number;
  ratePerMile: number;
};

export function totalsFor(trips: MileageTrip[]): MileageTotals {
  const miles = trips.reduce((sum, trip) => sum + Number(trip.miles), 0);
  const deduction = trips.reduce((sum, trip) => sum + Number(trip.deduction_value), 0);
  return { miles, deduction, trips: trips.length, ratePerMile: miles ? deduction / miles : 0 };
}

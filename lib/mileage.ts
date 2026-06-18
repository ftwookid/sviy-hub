import type { ParsedMileageFile, ParsedMileageTrip } from "@/types/mileage";

const REQUIRED_HEADERS = ["START_DATE*", "END_DATE*", "CATEGORY*", "START*", "STOP*", "RATE", "MILES*"];

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseMileIqDate(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) throw new Error(`Could not read trip date "${value}".`);

  const [, month, day, year, hour = "0", minute = "0"] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (Number.isNaN(date.getTime())) throw new Error(`Could not read trip date "${value}".`);
  return date;
}

function localIso(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function inputDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function numeric(value: string, label: string) {
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed)) throw new Error(`Could not read ${label} value "${value}".`);
  return parsed;
}

export function parseMileIqCsv(text: string): ParsedMileageFile {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  const headerIndex = rows.findIndex((row) => REQUIRED_HEADERS.every((header) => row.includes(header)));
  if (headerIndex < 0) throw new Error("This does not look like a MileIQ detailed log CSV.");

  const headers = rows[headerIndex];
  const column = (name: string) => headers.indexOf(name);
  const optional = (name: string) => headers.indexOf(name);
  const trips: ParsedMileageTrip[] = [];

  for (const row of rows.slice(headerIndex + 1)) {
    if (!row[column("START_DATE*")] || row[column("CATEGORY*")] !== "Business") continue;

    const start = parseMileIqDate(row[column("START_DATE*")]);
    const endValue = row[column("END_DATE*")];
    const end = endValue ? parseMileIqDate(endValue) : null;
    const rate = numeric(row[column("RATE")], "rate");
    const miles = numeric(row[column("MILES*")], "miles");
    const valueAt = (name: string) => {
      const index = optional(name);
      return index >= 0 ? row[index] || null : null;
    };

    trips.push({
      start_at: localIso(start),
      end_at: end ? localIso(end) : null,
      start_location: row[column("START*")] || "",
      stop_location: row[column("STOP*")] || "",
      rate,
      miles,
      deduction_value: Number((miles * rate).toFixed(2)),
      vehicle: valueAt("VEHICLE"),
      purpose: valueAt("PURPOSE"),
      notes: valueAt("NOTES")
    });
  }

  if (trips.length === 0) throw new Error("No Business trips were found in this file.");

  trips.sort((a, b) => a.start_at.localeCompare(b.start_at));
  const first = new Date(trips[0].start_at);
  const last = new Date(trips[trips.length - 1].start_at);
  if (first.getFullYear() !== last.getFullYear() || first.getMonth() !== last.getMonth()) {
    throw new Error("This file contains Business trips from more than one month. Upload one month at a time.");
  }

  const monthEnd = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const businessMiles = trips.reduce((sum, trip) => sum + trip.miles, 0);
  const deductionValue = trips.reduce((sum, trip) => sum + trip.deduction_value, 0);

  return {
    periodMonth: inputDate(new Date(first.getFullYear(), first.getMonth(), 1)),
    periodStart: inputDate(first),
    periodEnd: inputDate(last),
    isComplete: last.getDate() === monthEnd.getDate(),
    businessMiles: Number(businessMiles.toFixed(2)),
    deductionValue: Number(deductionValue.toFixed(2)),
    trips
  };
}

export async function hashMileageCsv(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function formatMileageMonth(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(`${value.slice(0, 7)}-01T12:00:00`)
  );
}

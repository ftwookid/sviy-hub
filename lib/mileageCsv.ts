import type { ParsedMileageCsv, ParsedMileageTrip } from "@/types/mileage";

const REQUIRED_COLUMNS = [
  "START_DATE*",
  "END_DATE*",
  "CATEGORY*",
  "START*",
  "STOP*",
  "RATE",
  "MILES*",
  "VEHICLE",
  "PURPOSE",
  "NOTES"
] as const;

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function parseMileIqDate(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const [, month, day, year, hour = "0", minute = "0", second = "0"] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function localTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function dateOnly(date: Date) {
  return localTimestamp(date).slice(0, 10);
}

function numeric(value: string) {
  const parsed = Number(value.replaceAll("$", "").replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function monthLabel(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function inferCompleteness(coverageEnd: Date) {
  const lastDay = new Date(coverageEnd.getFullYear(), coverageEnd.getMonth() + 1, 0).getDate();
  return coverageEnd.getDate() >= lastDay - 2;
}

export function parseMileageCsv(text: string): ParsedMileageCsv {
  if (!text.trim()) throw new Error("Choose a MileIQ CSV or paste its contents first.");

  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  const headerIndex = rows.findIndex((row) => row[0]?.trim().toUpperCase() === "START_DATE*");
  if (headerIndex < 0) {
    throw new Error("This does not look like a MileIQ export. The DETAILED LOG header could not be found.");
  }

  const headers = rows[headerIndex].map((header) => header.trim().toUpperCase());
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index])) as Record<string, number>;
  const missing = REQUIRED_COLUMNS.filter((column) => indexes[column] === undefined);
  if (missing.length) throw new Error(`The MileIQ file is missing required columns: ${missing.join(", ")}.`);

  const datedRows = rows
    .slice(headerIndex + 1)
    .map((row) => ({ row, startDate: parseMileIqDate(row[indexes["START_DATE*"]] ?? "") }))
    .filter((entry): entry is { row: string[]; startDate: Date } => Boolean(entry.startDate));

  if (!datedRows.length) throw new Error("No trip rows with valid start dates were found.");

  const monthKeys = Array.from(
    new Set(datedRows.map(({ startDate }) => `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`))
  );
  if (monthKeys.length !== 1) {
    throw new Error(
      `This file contains trips from ${monthKeys.length} different months (${monthKeys.join(", ")}). Upload one month at a time.`
    );
  }

  const periodMonth = `${monthKeys[0]}-01`;
  const allDates = datedRows.map(({ startDate }) => startDate).sort((a, b) => a.getTime() - b.getTime());
  const coverageStartDate = allDates[0];
  const coverageEndDate = allDates[allDates.length - 1];
  const businessTrips: ParsedMileageTrip[] = [];

  for (const { row, startDate } of datedRows) {
    const category = (row[indexes["CATEGORY*"]] ?? "").trim().toLowerCase();
    if (category !== "business") continue;

    const miles = numeric(row[indexes["MILES*"]] ?? "");
    const rate = numeric(row[indexes.RATE] ?? "");
    if (miles === null || rate === null || miles < 0 || rate < 0) {
      throw new Error(`A Business trip on ${dateOnly(startDate)} has an invalid RATE or MILES value.`);
    }

    const endDate = parseMileIqDate(row[indexes["END_DATE*"]] ?? "");
    businessTrips.push({
      start_at: localTimestamp(startDate),
      end_at: endDate ? localTimestamp(endDate) : null,
      start_location: row[indexes["START*"]]?.trim() || null,
      stop_location: row[indexes["STOP*"]]?.trim() || null,
      rate,
      miles,
      deduction_value: Number((miles * rate).toFixed(2)),
      vehicle: row[indexes.VEHICLE]?.trim() || null,
      purpose: row[indexes.PURPOSE]?.trim() || null,
      notes: row[indexes.NOTES]?.trim() || null
    });
  }

  if (!businessTrips.length) {
    throw new Error(`No Business trips were found in the ${monthLabel(periodMonth)} file.`);
  }

  return {
    periodMonth,
    periodLabel: monthLabel(periodMonth),
    coverageStart: dateOnly(coverageStartDate),
    coverageEnd: dateOnly(coverageEndDate),
    isComplete: inferCompleteness(coverageEndDate),
    businessTrips,
    businessMiles: Number(businessTrips.reduce((sum, trip) => sum + trip.miles, 0).toFixed(2)),
    deductionValue: Number(businessTrips.reduce((sum, trip) => sum + trip.deduction_value, 0).toFixed(2)),
    ignoredTripCount: datedRows.length - businessTrips.length,
    allTripCount: datedRows.length
  };
}

export async function hashMileageCsv(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

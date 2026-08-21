const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const roundedCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric"
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric"
});

export function formatCurrency(value: number | string) {
  return currencyFormatter.format(Number(value || 0));
}

/**
 * Currency with the cents dropped — for a figure that is an extrapolation
 * rather than an amount anybody was charged, like a yearly run rate. Printing
 * "$28,431.72 a year" claims a precision the number does not have.
 */
export function formatCurrencyRounded(value: number | string) {
  return roundedCurrencyFormatter.format(Number(value || 0));
}


export function formatMonth(date: Date) {
  return monthFormatter.format(date);
}

export function formatShortDate(dateValue: string) {
  return shortDateFormatter.format(parseLocalDate(dateValue));
}

export function todayInputValue() {
  return toInputDate(new Date());
}

export function toInputDate(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 10);
}

export function parseLocalDate(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function monthRange(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    start: toInputDate(start),
    end: toInputDate(end)
  };
}

export function daysAgo(dateValue: string | null) {
  if (!dateValue) return "Never";
  const date = parseLocalDate(dateValue);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((startOfToday.getTime() - date.getTime()) / 86_400_000);

  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff} days ago`;
}

export function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

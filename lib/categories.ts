/**
 * The categories this business actually uses, ordered most-used first.
 *
 * This replaced the full Schedule C line-item list, which was 22 options of
 * which four ever got picked — Pension & Profit Sharing and Rent — Machinery
 * were pure noise in every dropdown. The order here is the order they appear
 * everywhere, so the common pick is always near the top of the list.
 */
export const EXPENSE_CATEGORIES = [
  "Transportation",
  "Supplies",
  "Software & Apps",
  "Insurance",
  "Professional Services",
  "Meals",
  "Phone & Communications",
  "Home Office",
  "Miscellaneous"
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Where anything uncategorised lands. */
export const DEFAULT_CATEGORY: ExpenseCategory = "Miscellaneous";

/**
 * Short forms for the places a category has to fit a fixed-width chip.
 * Only the ones that would otherwise truncate need an entry.
 */
const SHORT_LABELS: Partial<Record<ExpenseCategory, string>> = {
  "Professional Services": "Professional",
  "Phone & Communications": "Phone"
};

export function categoryShortLabel(category: string) {
  return SHORT_LABELS[category as ExpenseCategory] ?? category;
}

/**
 * Old Schedule C values mapped onto the list above.
 *
 * Rows written before the change still carry these, so every read normalizes
 * through here. `supabase/category-migration.sql` applies the same mapping to
 * the stored data; until it is run, the app still reads correctly.
 */
export const LEGACY_CATEGORY_MAP: Record<string, ExpenseCategory> = {
  Advertising: "Miscellaneous",
  "Car & Truck": "Transportation",
  "Commissions & Fees": "Professional Services",
  "Contract Labor": "Professional Services",
  Depreciation: "Miscellaneous",
  "Employee Benefits": "Miscellaneous",
  Insurance: "Insurance",
  "Interest — Mortgage": "Miscellaneous",
  "Interest — Other": "Miscellaneous",
  "Legal & Professional": "Professional Services",
  "Meals & Entertainment": "Meals",
  "Office Expense": "Home Office",
  "Other Expense": "Miscellaneous",
  "Pension & Profit Sharing": "Miscellaneous",
  "Rent — Machinery": "Miscellaneous",
  "Rent — Other Business Property": "Home Office",
  "Repairs & Maintenance": "Miscellaneous",
  Supplies: "Supplies",
  "Taxes & Licenses": "Miscellaneous",
  Travel: "Transportation",
  Utilities: "Home Office",
  Wages: "Professional Services"
};

const KNOWN = new Set<string>(EXPENSE_CATEGORIES);

export function isKnownCategory(category: string | null | undefined): boolean {
  return Boolean(category) && KNOWN.has(category as string);
}

/**
 * A stored category as one of the current ones.
 *
 * Anything unrecognised falls back to Miscellaneous rather than disappearing —
 * a row that quietly drops out of a tax report is worse than one filed under
 * the wrong heading, because only the second is visible.
 */
export function normalizeCategory(category: string | null | undefined): ExpenseCategory | null {
  if (!category) return null;
  if (KNOWN.has(category)) return category as ExpenseCategory;
  return LEGACY_CATEGORY_MAP[category] ?? DEFAULT_CATEGORY;
}

/** Fixed per category, so a tag never changes colour as the list is re-sorted. */
const CATEGORY_COLORS: Record<ExpenseCategory, { background: string; text: string }> = {
  Transportation: { background: "#E7EEF3", text: "#3B5A6E" },
  Supplies: { background: "#F0E8D8", text: "#6F562B" },
  "Software & Apps": { background: "#ECE9F1", text: "#5C5268" },
  Insurance: { background: "#EAF4EE", text: "#37684F" },
  "Professional Services": { background: "#E8F1F0", text: "#3F6663" },
  Meals: { background: "#FAEAEA", text: "#733030" },
  "Phone & Communications": { background: "#EEF0E8", text: "#596141" },
  "Home Office": { background: "#F3ECE5", text: "#6A5140" },
  Miscellaneous: { background: "#EFEEEB", text: "#65625C" }
};

const UNKNOWN_COLORS = { background: "#EFEEEB", text: "#65625C" };

export function categoryTagColors(category: string) {
  return CATEGORY_COLORS[normalizeCategory(category) ?? DEFAULT_CATEGORY] ?? UNKNOWN_COLORS;
}

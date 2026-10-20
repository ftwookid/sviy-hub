/**
 * A posted bank or card transaction.
 *
 * This is not an expense and not a finance line. An expense is a business cost
 * filed for tax. A finance line is a commitment someone typed in. A bank
 * transaction is what an account actually posted, brought in by an importer.
 *
 * Category and project are closed lists, the same shape as a finance bucket:
 * a string union here, a check constraint on the table. One of each per row.
 */

export const BANK_CATEGORIES = [
  "Bills",
  "Family & home",
  "Fun",
  "Planned purchases",
  "Business",
  "Saving & investing",
  "Transfers & card payments",
  "One-time family help",
  "Income"
] as const;

export type BankCategory = (typeof BANK_CATEGORIES)[number];

/**
 * What a chip has room to say. The menu and the accessible name keep the full
 * category; only the chip, which sits in a fixed column, uses the short form.
 * Same job as the short labels on the tax categories.
 */
export const BANK_CATEGORY_SHORT: Record<BankCategory, string> = {
  Bills: "Bills",
  "Family & home": "Home",
  Fun: "Fun",
  "Planned purchases": "Planned",
  Business: "Business",
  "Saving & investing": "Saving",
  "Transfers & card payments": "Transfers",
  "One-time family help": "Family help",
  Income: "Income"
};

export const BANK_PROJECTS = [
  "Personal",
  "Speedrack West",
  "Lenokers",
  "Facility Goods",
  "Sviy-Hub"
] as const;

export type BankProject = (typeof BANK_PROJECTS)[number];

export type BankTransaction = {
  id: string;
  user_id: string;
  external_id: string;
  date: string;
  /** Plaid sign: positive leaves the account, negative arrives. */
  amount: number;
  merchant: string;
  account_label: string;
  category: BankCategory;
  project: BankProject;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

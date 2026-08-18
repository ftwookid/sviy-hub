import { documentBlock, runJsonPass } from "@/lib/anthropicJson";
import type { AuditResult, ExtractionResult } from "@/types/statementImport";

/**
 * Reading a bank statement PDF into transaction rows.
 *
 * Accuracy is worth more here than speed: a missed line is a deduction lost, and
 * an invented line is a deduction that will not survive an audit. So this runs a
 * small, cheap model twice rather than a large one once —
 *
 *   pass 1  extract every transaction
 *   pass 2  re-read the same PDF holding pass 1's output, and correct it
 *
 * then checks the arithmetic against the totals the statement prints on itself
 * (see `reconcile` in lib/statementImports.ts). Two independent reads plus a sum
 * that has to balance catches far more than one confident read does.
 *
 * Both passes are pinned to a JSON schema, so the response is always parseable —
 * there is no regex-scraping or retry-on-bad-JSON path to get wrong.
 */

/**
 * Sentinels instead of nullable fields: structured outputs handle a fixed type
 * per property most predictably, and "" / -1 are unambiguous for these fields.
 */
const STATEMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "institution",
    "accountLabel",
    "periodStart",
    "periodEnd",
    "statedTotalDebits",
    "statedTotalCredits",
    "pageCount",
    "notes"
  ],
  properties: {
    institution: { type: "string", description: "Bank or card issuer name, or \"\" if unclear." },
    accountLabel: {
      type: "string",
      description: "Account nickname plus the last 4 digits, e.g. \"Checking 4417\". \"\" if unclear."
    },
    periodStart: { type: "string", description: "Statement period start as YYYY-MM-DD, or \"\"." },
    periodEnd: { type: "string", description: "Statement period end as YYYY-MM-DD, or \"\"." },
    statedTotalDebits: {
      type: "number",
      description:
        "The total of withdrawals/purchases the statement prints on itself, as a positive number. Use -1 if the statement does not print such a total. Never compute it yourself."
    },
    statedTotalCredits: {
      type: "number",
      description:
        "The total of deposits/payments/credits the statement prints on itself, as a positive number. Use -1 if not printed. Never compute it yourself."
    },
    pageCount: { type: "integer", description: "Number of pages in the document." },
    notes: {
      type: "string",
      description:
        "Anything that could make this read unreliable: unreadable pages, cut-off tables, continued-on-next-page rows. \"\" if the document was clean."
    }
  }
} as const;

const TRANSACTION_SCHEMA = {
  type: "array",
  description: "Every transaction line on the statement, in the order printed.",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["date", "description", "merchant", "amount", "direction", "confidence", "page"],
    properties: {
      date: {
        type: "string",
        description:
          "Transaction date as YYYY-MM-DD. Use the transaction date, not the posting date, when both are printed. Infer the year from the statement period when the line omits it."
      },
      description: {
        type: "string",
        description: "The descriptor exactly as printed, including reference numbers."
      },
      merchant: {
        type: "string",
        description:
          "The readable name of who was paid, cleaned of card numbers and POS noise. E.g. \"SQ *CHEWY.COM 4417\" becomes \"Chewy\"."
      },
      amount: {
        type: "number",
        description: "Always a positive number. Direction carries the sign."
      },
      direction: {
        type: "string",
        enum: ["Debit", "Credit"],
        description:
          "Debit = money leaving the account (purchase, withdrawal, fee). Credit = money arriving (deposit, refund, payment received)."
      },
      confidence: {
        type: "string",
        enum: ["high", "low"],
        description:
          "\"low\" if any field on this line was hard to read, ambiguous, or inferred rather than printed."
      },
      page: { type: "integer", description: "1-indexed page the line appears on." }
    }
  }
} as const;

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["statement", "transactions"],
  properties: { statement: STATEMENT_SCHEMA, transactions: TRANSACTION_SCHEMA }
} as const;

const AUDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["statement", "transactions", "audit"],
  properties: {
    statement: STATEMENT_SCHEMA,
    transactions: TRANSACTION_SCHEMA,
    audit: {
      type: "object",
      additionalProperties: false,
      required: ["agrees", "notes"],
      properties: {
        agrees: {
          type: "boolean",
          description: "True only if the first pass needed no additions, removals, or edits."
        },
        notes: {
          type: "string",
          description: "What you changed and why, in one or two sentences. \"\" if nothing changed."
        }
      }
    }
  }
} as const;

const EXTRACT_PROMPT = `Read this bank or credit card statement and list every transaction on it.

Work through the document page by page. Statements often split their transactions across several tables and pages, and a table that ends at a page break usually continues on the next page — account for both.

Rules that matter for the numbers to come out right:
- Include every transaction line, including fees, interest, refunds, and transfers.
- Do not include running balances, subtotals, section totals, or the ending balance as transactions.
- Do not merge two lines that share a merchant, and do not split one line into two.
- Amounts are always positive; \`direction\` carries whether money left or arrived.
- For the statement's own printed totals, copy what is printed. If it is not printed, use -1. Never substitute your own sum.

Mark a line \`low\` confidence whenever you had to infer, guess, or squint at any part of it.`;

const AUDIT_PROMPT = `A first pass over this same statement produced the JSON below. Your job is to check it against the document and return the corrected version.

Re-read the statement independently rather than assuming the first pass was right. Look specifically for:
- transactions on the statement that are missing from the list,
- entries in the list that are not real transactions (balances, subtotals, headers),
- wrong dates, amounts, or directions,
- duplicated lines.

Return the full corrected transaction list — not just the differences. If the first pass was already correct, return it unchanged and set \`agrees\` to true.

First pass output:
`;

const TOO_LONG =
  "This statement is longer than one scan can hold. Split the PDF and import it in parts.";

export async function extractStatement(base64Pdf: string): Promise<ExtractionResult> {
  return runJsonPass<ExtractionResult>(
    [documentBlock(base64Pdf), { type: "text", text: EXTRACT_PROMPT }],
    EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
    { tooLongMessage: TOO_LONG }
  );
}

export async function auditStatement(
  base64Pdf: string,
  firstPass: ExtractionResult
): Promise<AuditResult> {
  return runJsonPass<AuditResult>(
    [
      documentBlock(base64Pdf),
      { type: "text", text: `${AUDIT_PROMPT}${JSON.stringify(firstPass, null, 2)}` }
    ],
    AUDIT_SCHEMA as unknown as Record<string, unknown>,
    { tooLongMessage: TOO_LONG }
  );
}

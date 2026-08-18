import { documentBlock, runJsonPass } from "@/lib/anthropicJson";
import type { ProofSheetLine, SheetColumnMap } from "@/types/proofSheet";

/**
 * Working out what a vendor's report is saying.
 *
 * Two different jobs, because two different kinds of file arrive:
 *
 *   spreadsheet  the model names the columns; the app reads the values
 *   PDF          the model has to transcribe, because there is no grid to read
 *
 * The spreadsheet path is the one that matters, and it is deliberately the one
 * where no number passes through a model. Column headings vary wildly between
 * vendors — "Total Fee", "Amount Charged", "Gross" — and choosing between them
 * is exactly the judgement a model is good at. Copying four hundred amounts is
 * exactly what it is worst at, and a misread digit here means proof filed
 * against a transaction it does not prove.
 */

const COLUMN_MAP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "vendor",
    "headerRow",
    "firstDataRow",
    "dateColumn",
    "amountColumn",
    "descriptionColumns",
    "notes"
  ],
  properties: {
    vendor: {
      type: "string",
      description: "Who issued this report, e.g. \"City of Portland parking\". \"\" if unclear."
    },
    headerRow: {
      type: "integer",
      description: "The R number of the row holding the column headings. -1 if there is none."
    },
    firstDataRow: {
      type: "integer",
      description: "The R number of the first row that is an actual transaction."
    },
    dateColumn: {
      type: "integer",
      description:
        "The C number of the column holding the date of each transaction. If the report prints both a start and an end time, use the one the charge is dated by — normally the start."
    },
    amountColumn: {
      type: "integer",
      description:
        "The C number of the column holding the amount actually charged to the card: the grand total for that line, including fees and tax, not a component of it."
    },
    descriptionColumns: {
      type: "array",
      items: { type: "integer" },
      description:
        "Up to three C numbers whose values together identify the line to a human — location, space, reference number. Never the date or the amount."
    },
    notes: {
      type: "string",
      description:
        "Anything that makes this report awkward to read: several tables, subtotal rows mixed in, an ambiguous amount column. \"\" if it is clean."
    }
  }
} as const;

const COLUMN_MAP_PROMPT = `Below is the first part of a spreadsheet a vendor issued as a record of many small charges — parking, tolls, transit, or similar. Each cell is labelled with its row (R) and column (C) number.

Your job is only to say which columns mean what. Do not copy any values out of the sheet; the app reads them itself using the column numbers you return.

Watch for:
- title, criteria, and blank rows above the real table — \`firstDataRow\` is the first genuine transaction, not the heading.
- several amount columns, where only one is what the card was actually charged. Fees and tax are usually printed separately and then again inside the total. Choose the total.
- a report that dates each line by an entry or start time.

Sheet:
`;

const PDF_LINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["vendor", "notes", "lines"],
  properties: {
    vendor: { type: "string", description: "Who issued this report. \"\" if unclear." },
    notes: {
      type: "string",
      description: "Anything that could make this read unreliable. \"\" if the document was clean."
    },
    lines: {
      type: "array",
      description: "Every charge listed on the report, in the order printed.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "amount", "description"],
        properties: {
          date: { type: "string", description: "The date of the charge as YYYY-MM-DD." },
          amount: {
            type: "number",
            description:
              "The amount actually charged for this line, including fees and tax. Always positive."
          },
          description: {
            type: "string",
            description: "What identifies this line to a human — location, reference, space number."
          }
        }
      }
    }
  }
} as const;

const PDF_PROMPT = `This document is a vendor's report of many small charges — parking, tolls, transit, or similar. List every charge on it.

Rules that matter for the amounts to come out right:
- Copy the total charged for each line, including fees and tax. If the report prints the fee and the tax separately as well, do not list them as their own lines.
- Do not include subtotals, section totals, or the report's grand total as charges.
- Amounts are always positive.
- Infer the year from the report's period when a line omits it.`;

export async function mapSheetColumns(preview: string): Promise<SheetColumnMap> {
  return runJsonPass<SheetColumnMap>(
    [{ type: "text", text: `${COLUMN_MAP_PROMPT}${preview}` }],
    COLUMN_MAP_SCHEMA as unknown as Record<string, unknown>,
    { maxTokens: 4000, thinkingBudget: 3000 }
  );
}

export async function transcribeProofPdf(
  base64Pdf: string
): Promise<{ vendor: string; notes: string; lines: Omit<ProofSheetLine, "row">[] }> {
  return runJsonPass(
    [documentBlock(base64Pdf), { type: "text", text: PDF_PROMPT }],
    PDF_LINE_SCHEMA as unknown as Record<string, unknown>,
    {
      tooLongMessage:
        "This report is longer than one scan can hold. Split it and upload it in parts."
    }
  );
}

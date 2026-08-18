import { inflateRawSync } from "zlib";

/**
 * Reading a spreadsheet into a plain grid of strings, without a dependency.
 *
 * Vendors that bill a lot of small charges — parking, tolls, transit — hand out
 * one monthly report covering hundreds of transactions, and it arrives as .xlsx
 * or .csv far more often than as a PDF. An .xlsx is a zip of XML, so the whole
 * reader is a small zip parse plus three regex passes; pulling in a full
 * spreadsheet library for that would be a lot of weight for one screen.
 *
 * The output is deliberately dumb: `string[][]`, exactly as printed, with dates
 * normalized and nothing else interpreted. Deciding which column means what is
 * a separate job (lib/proofSheetExtraction.ts), and reading the numbers out of
 * the grid is a third (lib/proofSheets.ts). Keeping them apart is what lets the
 * amounts reach the matcher without ever passing through a model.
 *
 * Not supported, on purpose: zip64 (a 4 GB spreadsheet is not a receipt),
 * encrypted workbooks, and the legacy binary .xls format.
 */

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;

/** Excel's day zero. 1899-12-30, thanks to the deliberate 1900 leap-year bug. */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** Number formats Excel ships with that render as a date or a time. */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

export type SheetGrid = {
  /** Rows of cells, as printed. Ragged: trailing empty cells are not padded. */
  rows: string[][];
  /** Total rows read, before any preview truncation. */
  rowCount: number;
};

function findEndOfCentralDirectory(buffer: Buffer) {
  // The record is at the very end unless the archive carries a comment, which
  // is capped at 64 KB — so this is the whole search space.
  const from = Math.max(0, buffer.length - 66_000);
  for (let offset = buffer.length - 22; offset >= from; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) return offset;
  }
  return -1;
}

/** Every file in a zip archive, by name. */
function readZip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) return files;

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length) break;
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE) break;

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    // The central directory's copy of the header lengths does not have to match
    // the local one, so the data start is always read from the local header.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    try {
      files.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    } catch {
      // One unreadable part should not lose the rest of the workbook.
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

function unescapeXml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** All the text inside an element, runs and all. */
function textOf(xml: string) {
  const parts = xml.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
  return parts.map((part) => unescapeXml(part.replace(/<[^>]+>/g, ""))).join("");
}

function readSharedStrings(xml: string | undefined) {
  if (!xml) return [];
  return (xml.match(/<si\b[\s\S]*?<\/si>|<si\b[^>]*\/>/g) ?? []).map(textOf);
}

/**
 * Which cell styles render as dates.
 *
 * Excel stores a date as a number and a formatting rule, so without reading
 * styles.xml a column of dates arrives as five-digit serials. Returns the set of
 * style indexes whose number format is a date or time.
 */
function readDateStyles(xml: string | undefined) {
  const dateStyles = new Set<number>();
  if (!xml) return dateStyles;

  const customDateFormats = new Set<number>();
  Array.from(xml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)).forEach(
    (match) => {
      // Strip quoted literals first: a currency format like "USD"#,##0.00 has a
      // `d` in it that has nothing to do with days.
      const code = unescapeXml(match[2]).replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
      if (/[ymdhs]/i.test(code)) customDateFormats.add(Number(match[1]));
    }
  );

  const cellXfs = xml.match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0] ?? "";
  const entries = cellXfs.match(/<xf\b[^>]*\/?>/g) ?? [];
  entries.forEach((entry, index) => {
    const id = Number(entry.match(/numFmtId="(\d+)"/)?.[1] ?? 0);
    if (BUILTIN_DATE_FORMATS.has(id) || customDateFormats.has(id)) dateStyles.add(index);
  });

  return dateStyles;
}

/** "BQ12" -> 68. Column letters are base-26 with no zero. */
function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function serialToIsoDate(serial: number) {
  const date = new Date(EXCEL_EPOCH_MS + Math.floor(serial) * 86_400_000);
  return Number.isNaN(date.getTime()) ? String(serial) : date.toISOString().slice(0, 10);
}

function readSheet(xml: string, sharedStrings: string[], dateStyles: Set<number>) {
  const rows: string[][] = [];

  Array.from(xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)).forEach((rowMatch) => {
    const cells: string[] = [];

    Array.from(rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)).forEach((cellMatch) => {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const at = columnIndex(attributes.match(/r="([A-Z]+\d+)"/)?.[1] ?? "A1");
      const type = attributes.match(/t="([^"]+)"/)?.[1] ?? "n";
      const style = Number(attributes.match(/s="(\d+)"/)?.[1] ?? -1);
      const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";

      let value: string;
      if (type === "s") value = sharedStrings[Number(rawValue)] ?? "";
      else if (type === "inlineStr") value = textOf(body);
      else if (type === "str" || type === "e") value = unescapeXml(rawValue);
      else if (rawValue && dateStyles.has(style)) value = serialToIsoDate(Number(rawValue));
      else value = unescapeXml(rawValue);

      while (cells.length < at) cells.push("");
      cells[at] = value.trim();
    });

    rows.push(cells);
  });

  return rows;
}

/** The first worksheet in the workbook's own tab order, not on disk order. */
function firstSheetPath(files: Map<string, Buffer>) {
  const workbook = files.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const relationshipId = workbook.match(/<sheet\b[^>]*r:id="([^"]+)"/)?.[1];

  if (relationshipId) {
    const target = rels
      .match(new RegExp(`<Relationship[^>]*Id="${relationshipId}"[^>]*>`))?.[0]
      ?.match(/Target="([^"]+)"/)?.[1];
    if (target) {
      const path = target.replace(/^\/?xl\//, "").replace(/^\//, "");
      if (files.has(`xl/${path}`)) return `xl/${path}`;
    }
  }

  const fallback = Array.from(files.keys())
    .filter((name) => name.startsWith("xl/worksheets/") && name.endsWith(".xml"))
    .sort();
  return fallback[0];
}

export function readXlsxGrid(buffer: Buffer): SheetGrid {
  const files = readZip(buffer);
  const sheetPath = firstSheetPath(files);
  const sheetXml = sheetPath ? files.get(sheetPath)?.toString("utf8") : undefined;

  if (!sheetXml) throw new Error("That spreadsheet could not be opened.");

  const rows = readSheet(
    sheetXml,
    readSharedStrings(files.get("xl/sharedStrings.xml")?.toString("utf8")),
    readDateStyles(files.get("xl/styles.xml")?.toString("utf8"))
  );

  return { rows, rowCount: rows.length };
}

/** Handles quoted fields, embedded commas and newlines, and doubled quotes. */
export function readCsvGrid(text: string, delimiter = ","): SheetGrid {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const pushField = () => {
    row.push(field.trim());
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === delimiter) pushField();
    else if (character === "\r") continue;
    else if (character === "\n") pushRow();
    else field += character;
  }

  if (field.length > 0 || row.length > 0) pushRow();

  return { rows, rowCount: rows.length };
}

export function readGrid(buffer: Buffer, filename: string): SheetGrid {
  if (/\.csv$/i.test(filename)) return readCsvGrid(buffer.toString("utf8"));
  if (/\.tsv$/i.test(filename)) return readCsvGrid(buffer.toString("utf8"), "\t");
  return readXlsxGrid(buffer);
}

/**
 * The grid as numbered text for the model to read.
 *
 * Rows and columns are labelled because the model's job is to name the columns
 * that matter, not to copy the data out of them — so it has to be able to point
 * at one. Only the head of a long report is sent: column meanings are settled by
 * the first screenful, and a year of parking would otherwise be 4,000 rows.
 */
export function gridPreview(grid: SheetGrid, maxRows = 40, maxCellLength = 60) {
  return grid.rows
    .slice(0, maxRows)
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, cellIndex) =>
          cell ? `C${cellIndex}=${cell.slice(0, maxCellLength)}` : ""
        )
        .filter(Boolean)
        .join(" | ");
      return `R${rowIndex}: ${cells}`;
    })
    .join("\n");
}

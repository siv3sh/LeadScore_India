/**
 * Turns an uploaded file into CSV text.
 *
 * This is the ingestion boundary: everything downstream (parseCSV, column
 * mapping, scoring, storage) keeps working on CSV text and knows nothing about
 * Excel. Adding a new source format means adding a branch here and nothing else.
 */

// SheetJS is roughly 400 KB, and only Excel uploads need it. Loading it on
// demand keeps it out of the initial bundle, which matters on the mobile
// connections most of our users are on. Declared at module top so the
// dependency stays visible rather than buried in a function body.
const loadSheetJs = () => import('xlsx');

/**
 * Well beyond a realistic lead export (the largest plan allows 50,000 leads,
 * which is a few MB of CSV), but low enough that a misdropped video or
 * database dump fails fast instead of freezing the browser tab.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type UploadKind = 'csv' | 'excel';

const EXCEL_EXTENSIONS = ['.xlsx', '.xlsm', '.xls'];
const CSV_EXTENSIONS = ['.csv', '.tsv', '.txt'];

/** Null when the extension is not something we can read. */
export function detectUploadKind(fileName: string): UploadKind | null {
  const lower = fileName.toLowerCase().trim();
  if (EXCEL_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'excel';
  if (CSV_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'csv';
  return null;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Returns a message explaining why the file cannot be read, or null when it is
 * acceptable. Checked before any parsing so an unreadable file costs nothing.
 */
export function validateUploadFile(file: { name: string; size: number }): string | null {
  if (!detectUploadKind(file.name)) {
    return 'That file type is not supported. Upload a CSV or an Excel file (.csv, .xlsx or .xls).';
  }
  if (file.size === 0) {
    return 'That file is empty. Add your leads and upload it again.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `That file is ${formatMb(file.size)}, which is over the ${formatMb(MAX_UPLOAD_BYTES)} limit. Split it into smaller files and upload them one at a time.`;
  }
  return null;
}

/**
 * Excel's own "CSV UTF-8" export writes a byte order mark, which would
 * otherwise become part of the first column's name and break its mapping.
 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export interface SheetContent {
  name: string;
  csv: string;
}

export interface SheetSelection {
  chosen: SheetContent;
  /** Other sheets that held data, so the user can be told they were ignored. */
  skipped: string[];
}

function hasContent(csv: string): boolean {
  return csv.replace(/[\s,"]/g, '').length > 0;
}

/**
 * Renders a spreadsheet date as unambiguous text.
 *
 * Deliberately uses the local calendar components rather than toISOString:
 * SheetJS builds the Date in local time to represent the cell's wall-clock
 * value, so converting to UTC would shift an Indian user's date back by a day.
 */
export function formatSpreadsheetDate(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const hasTime = value.getHours() + value.getMinutes() + value.getSeconds() > 0;
  if (!hasTime) return day;
  return `${day}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatSpreadsheetDate(value);
  // parseCSV splits on newlines before parsing quotes, so a cell containing a
  // line break (common in notes columns) would otherwise split one lead into
  // two broken rows.
  return String(value).replace(/[\r\n]+/g, ' ');
}

function escapeCell(text: string): string {
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Serialises sheet rows to CSV ourselves rather than using SheetJS's own
 * converter, which renders dates using each cell's display format — that
 * produces locale-dependent text like 17/09/2026 that the timestamp parser
 * reads as invalid and silently replaces with today.
 */
export function rowsToCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map((cell) => escapeCell(formatCell(cell))).join(',')).join('\n');
}

/**
 * Picks the first sheet that actually contains something.
 *
 * Real workbooks routinely lead with an empty "Sheet1" or a cover tab, so
 * taking index 0 blindly would tell the user their file was empty when their
 * leads are sitting on the next tab.
 */
export function selectSheet(sheets: SheetContent[]): SheetSelection {
  const populated = sheets.filter((sheet) => hasContent(sheet.csv));
  if (populated.length === 0) {
    throw new Error(
      'That workbook has no data in any sheet. Add your leads and upload it again.'
    );
  }
  const [chosen, ...rest] = populated;
  return { chosen, skipped: rest.map((sheet) => sheet.name) };
}

export interface UploadRead {
  csvText: string;
  /** The sheet the data came from, or null for a CSV upload. */
  sheetName: string | null;
  skippedSheets: string[];
}

async function readExcel(file: File): Promise<UploadRead> {
  const { read, utils } = await loadSheetJs();

  let workbook;
  try {
    // cellDates is not optional. Excel stores dates as serial numbers, and a
    // bare serial like 45917 parses as the year 45916 rather than failing —
    // it would sail through the timestamp check and wreck recency scoring.
    workbook = read(await file.arrayBuffer(), { cellDates: true });
  } catch {
    throw new Error(
      'Could not open that Excel file. It may be password-protected or damaged — try re-saving it, or export it as CSV.'
    );
  }

  const sheets = workbook.SheetNames.map((name) => ({
    name,
    // raw: true yields the underlying values — real Dates and real numbers —
    // instead of whatever the spreadsheet was formatted to display.
    csv: rowsToCsv(
      utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
        header: 1,
        raw: true,
        blankrows: false,
      })
    ),
  }));

  const { chosen, skipped } = selectSheet(sheets);
  return { csvText: chosen.csv, sheetName: chosen.name, skippedSheets: skipped };
}

export async function readUploadAsCsv(file: File): Promise<UploadRead> {
  const problem = validateUploadFile(file);
  if (problem) throw new Error(problem);

  const kind = detectUploadKind(file.name);
  switch (kind) {
    case 'csv':
      return { csvText: stripBom(await file.text()), sheetName: null, skippedSheets: [] };
    case 'excel':
      return await readExcel(file);
    case null:
      // Unreachable: validateUploadFile already rejected unknown extensions.
      throw new Error('That file type is not supported.');
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled upload kind: ${String(exhaustive)}`);
    }
  }
}

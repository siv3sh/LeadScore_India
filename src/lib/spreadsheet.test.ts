import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  MAX_UPLOAD_BYTES,
  detectUploadKind,
  formatSpreadsheetDate,
  readUploadAsCsv,
  rowsToCsv,
  selectSheet,
  stripBom,
  validateUploadFile,
} from './spreadsheet';
import { guessColumnMapping, mapRowsToLeadsWithHeaders, parseCSV } from './csvParser';

describe('detectUploadKind', () => {
  it('recognises Excel workbooks', () => {
    expect(detectUploadKind('leads.xlsx')).toBe('excel');
    expect(detectUploadKind('leads.xls')).toBe('excel');
    expect(detectUploadKind('leads.xlsm')).toBe('excel');
  });

  it('recognises delimited text files', () => {
    expect(detectUploadKind('leads.csv')).toBe('csv');
    expect(detectUploadKind('leads.tsv')).toBe('csv');
    expect(detectUploadKind('leads.txt')).toBe('csv');
  });

  // Windows and phone exports routinely produce these.
  it('ignores case and surrounding whitespace', () => {
    expect(detectUploadKind('LEADS.XLSX')).toBe('excel');
    expect(detectUploadKind('  Leads.Csv  ')).toBe('csv');
  });

  it('matches on the final extension, not one embedded in the name', () => {
    expect(detectUploadKind('march.csv.xlsx')).toBe('excel');
    expect(detectUploadKind('q1.xlsx.csv')).toBe('csv');
  });

  it('rejects anything else', () => {
    expect(detectUploadKind('leads.pdf')).toBeNull();
    expect(detectUploadKind('leads.numbers')).toBeNull();
    expect(detectUploadKind('holiday.mp4')).toBeNull();
    expect(detectUploadKind('leads')).toBeNull();
    expect(detectUploadKind('')).toBeNull();
  });
});

describe('validateUploadFile', () => {
  it('accepts a normal export', () => {
    expect(validateUploadFile({ name: 'leads.xlsx', size: 50_000 })).toBeNull();
  });

  it('rejects an unsupported type before looking at size', () => {
    expect(validateUploadFile({ name: 'holiday.mp4', size: 5 })).toContain('not supported');
  });

  it('rejects an empty file', () => {
    expect(validateUploadFile({ name: 'leads.csv', size: 0 })).toContain('empty');
  });

  // The point of the cap is that a misdropped large file fails instantly
  // instead of locking up the browser tab.
  it('rejects a file over the limit and says how big it was', () => {
    const message = validateUploadFile({ name: 'dump.csv', size: 25 * 1024 * 1024 });
    expect(message).toContain('25.0 MB');
    expect(message).toContain('10.0 MB');
  });

  it('accepts a file exactly at the limit', () => {
    expect(validateUploadFile({ name: 'leads.csv', size: MAX_UPLOAD_BYTES })).toBeNull();
  });

  it('rejects a file one byte over the limit', () => {
    expect(validateUploadFile({ name: 'leads.csv', size: MAX_UPLOAD_BYTES + 1 })).not.toBeNull();
  });
});

describe('stripBom', () => {
  // Excel's "CSV UTF-8" export writes a BOM, which would otherwise be glued to
  // the first column heading and break its auto-mapping.
  it('removes a leading byte order mark', () => {
    expect(stripBom('\uFEFFname,phone')).toBe('name,phone');
  });

  it('leaves text without one untouched', () => {
    expect(stripBom('name,phone')).toBe('name,phone');
    expect(stripBom('')).toBe('');
  });

  it('removes only the first one', () => {
    expect(stripBom('\uFEFF\uFEFFname')).toBe('\uFEFFname');
  });
});

describe('selectSheet', () => {
  it('returns the only populated sheet', () => {
    const result = selectSheet([{ name: 'Leads', csv: 'name,phone\nRiya,900' }]);

    expect(result.chosen.name).toBe('Leads');
    expect(result.skipped).toEqual([]);
  });

  // Workbooks often lead with an empty tab, and taking index 0 blindly would
  // tell the user their file was empty.
  it('skips leading empty sheets', () => {
    const result = selectSheet([
      { name: 'Sheet1', csv: '' },
      { name: 'Cover', csv: ',,\n,,' },
      { name: 'Leads', csv: 'name,phone\nRiya,900' },
    ]);

    expect(result.chosen.name).toBe('Leads');
    expect(result.skipped).toEqual([]);
  });

  it('reports other populated sheets as skipped', () => {
    const result = selectSheet([
      { name: 'January', csv: 'name\nRiya' },
      { name: 'February', csv: 'name\nAmit' },
      { name: 'Empty', csv: '   ' },
    ]);

    expect(result.chosen.name).toBe('January');
    expect(result.skipped).toEqual(['February']);
  });

  it('throws a readable error when nothing has data', () => {
    expect(() => selectSheet([{ name: 'Sheet1', csv: '' }])).toThrow(/no data in any sheet/);
    expect(() => selectSheet([])).toThrow(/no data in any sheet/);
  });
});

/**
 * Exercises the real SheetJS path rather than the pure helpers, because the
 * failure this guards against — Excel date serials reaching the scorer — is
 * invisible to the unit tests above.
 */
describe('readUploadAsCsv, on a real workbook', () => {
  function workbookFile(
    sheets: { name: string; rows: (string | number | Date)[][] }[],
    fileName = 'leads.xlsx'
  ): File {
    const book = XLSX.utils.book_new();
    for (const sheet of sheets) {
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
    }
    const buffer = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    return new File([buffer], fileName);
  }

  const HEADERS = ['name', 'phone', 'source', 'created_at', 'order_value', 'num_orders', 'status'];

  it('converts a sheet to CSV the existing parser understands', async () => {
    const file = workbookFile([
      {
        name: 'Leads',
        rows: [
          HEADERS,
          ['Riya Das', '9000000001', 'fb', new Date(Date.UTC(2026, 8, 17)), 1200, 1, 'won'],
        ],
      },
    ]);

    const { csvText, sheetName, skippedSheets } = await readUploadAsCsv(file);
    expect(sheetName).toBe('Leads');
    expect(skippedSheets).toEqual([]);

    const parsed = parseCSV(csvText);
    expect(parsed.headers).toEqual(HEADERS);
    expect(parsed.rows).toHaveLength(1);
  });

  // The regression that matters: a bare serial like 45917 parses as year 45916
  // rather than failing, so it would silently destroy recency scoring.
  it('writes real dates, never Excel serial numbers', async () => {
    const file = workbookFile([
      {
        name: 'Leads',
        rows: [
          HEADERS,
          ['Riya Das', '9000000001', 'fb', new Date(Date.UTC(2026, 8, 17)), 1200, 1, 'won'],
        ],
      },
    ]);

    const { csvText } = await readUploadAsCsv(file);
    expect(csvText).toContain('2026-09-17');
    expect(csvText).not.toContain('45917');

    const parsed = parseCSV(csvText);
    const leads = mapRowsToLeadsWithHeaders(
      parsed.headers,
      parsed.rows,
      guessColumnMapping(parsed.headers)
    );
    expect(new Date(leads[0].created_at).getUTCFullYear()).toBe(2026);
  });

  it('keeps numbers numeric rather than spreadsheet-formatted', async () => {
    const file = workbookFile([
      { name: 'Leads', rows: [HEADERS, ['Riya', '900', 'fb', '2026-09-17', 1250.5, 3, 'won']] },
    ]);

    const parsed = parseCSV((await readUploadAsCsv(file)).csvText);
    const leads = mapRowsToLeadsWithHeaders(
      parsed.headers,
      parsed.rows,
      guessColumnMapping(parsed.headers)
    );
    expect(leads[0].order_value).toBe(1250.5);
    expect(leads[0].num_orders).toBe(3);
  });

  it('reaches past an empty leading sheet and flags the ones it skipped', async () => {
    const file = workbookFile([
      { name: 'Sheet1', rows: [] },
      { name: 'January', rows: [HEADERS, ['Riya', '900', 'fb', '2026-09-17', 100, 1, 'won']] },
      { name: 'February', rows: [HEADERS, ['Amit', '901', 'ig', '2026-09-18', 200, 1, 'won']] },
    ]);

    const { sheetName, skippedSheets, csvText } = await readUploadAsCsv(file);
    expect(sheetName).toBe('January');
    expect(skippedSheets).toEqual(['February']);
    expect(csvText).toContain('Riya');
    expect(csvText).not.toContain('Amit');
  });

  it('reads a CSV upload unchanged, without loading the Excel parser', async () => {
    const file = new File(['\uFEFFname,phone\nRiya,900'], 'leads.csv');

    const { csvText, sheetName } = await readUploadAsCsv(file);
    expect(csvText).toBe('name,phone\nRiya,900');
    expect(sheetName).toBeNull();
  });

  it('rejects an unsupported file before trying to parse it', async () => {
    await expect(readUploadAsCsv(new File(['x'], 'holiday.mp4'))).rejects.toThrow(/not supported/);
  });

  // Renaming a CSV to .xlsx is a common mistake; SheetJS sniffs the content and
  // reads it anyway, which is the forgiving behaviour we want.
  it('still reads a CSV that was mislabelled as a workbook', async () => {
    const file = new File(['name,phone\nRiya,900'], 'leads.xlsx');

    const { csvText } = await readUploadAsCsv(file);
    expect(parseCSV(csvText).rows).toEqual([['Riya', '900']]);
  });

  it('explains itself when the workbook is genuinely corrupt', async () => {
    // Claims to be a zip (as .xlsx is) but the archive is damaged.
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0xfe, 0x01, 0x02, 0x03]);
    const file = new File([corrupt], 'leads.xlsx');

    await expect(readUploadAsCsv(file)).rejects.toThrow(/Could not open that Excel file/);
  });
});

describe('rowsToCsv', () => {
  it('quotes only the cells that need it', () => {
    expect(rowsToCsv([['name', 'city'], ['Riya', 'Kochi']])).toBe('name,city\nRiya,Kochi');
    expect(rowsToCsv([['Sharma, Riya']])).toBe('"Sharma, Riya"');
    expect(rowsToCsv([['He said "hi"']])).toBe('"He said ""hi"""');
  });

  it('renders blank cells as empty fields', () => {
    expect(rowsToCsv([['Riya', null, undefined, '']])).toBe('Riya,,,');
  });

  // parseCSV splits on newlines before it parses quotes, so a line break inside
  // a cell would split one lead into two broken rows.
  it('flattens line breaks inside a cell', () => {
    expect(rowsToCsv([['Riya', 'Called\nno answer']])).toBe('Riya,Called no answer');
  });
});

describe('formatSpreadsheetDate', () => {
  // Uses local calendar components on purpose: converting to UTC would move an
  // Indian user's date back a day.
  it('renders a date-only cell as YYYY-MM-DD', () => {
    expect(formatSpreadsheetDate(new Date(2026, 8, 17))).toBe('2026-09-17');
  });

  it('pads single-digit months and days', () => {
    expect(formatSpreadsheetDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('keeps a time component when the cell has one', () => {
    expect(formatSpreadsheetDate(new Date(2026, 8, 17, 14, 30, 5))).toBe('2026-09-17T14:30:05');
  });

  it('produces text the timestamp parser reads back to the same day', () => {
    const csv = `created_at\n${formatSpreadsheetDate(new Date(2026, 8, 17))}`;
    const parsed = parseCSV(csv);
    const leads = mapRowsToLeadsWithHeaders(parsed.headers, parsed.rows, {
      ...guessColumnMapping(parsed.headers),
      created_at: 'created_at',
    });
    expect(leads[0].created_at.slice(0, 10)).toBe('2026-09-17');
  });
});

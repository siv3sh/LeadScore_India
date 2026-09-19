import type { ColumnMapping } from '@/lib/csvParser';

/** Upload file_name prefix so we can replace the previous sync without stacking quota. */
export const SHEET_SYNC_FILE_PREFIX = 'google-sheet-sync';

const SHEET_ID_RE = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
const GID_RE = /[?&#]gid=([0-9]+)/;

/**
 * Turns a normal Sheets share link (or export link) into a CSV export URL.
 * The sheet must be shared as "Anyone with the link can view" (or published).
 */
export function toGoogleSheetCsvExportUrl(input: string): string {
  const raw = input.trim();
  if (!raw) {
    throw new Error('Paste your Google Sheet link first.');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('That does not look like a valid link.');
  }

  if (!url.hostname.includes('google.com') && !url.hostname.includes('googleapis.com')) {
    throw new Error('Use a Google Sheets link (docs.google.com/spreadsheets/...).');
  }

  // Already an export/pub CSV URL — keep gid if present.
  if (url.pathname.includes('/export') || url.pathname.includes('/pub')) {
    if (!url.searchParams.has('format')) {
      url.searchParams.set('format', 'csv');
    }
    return url.toString();
  }

  const idMatch = raw.match(SHEET_ID_RE);
  if (!idMatch) {
    throw new Error(
      'Could not find the spreadsheet ID. Open the Sheet → Share → copy the link.'
    );
  }

  const sheetId = idMatch[1];
  const gidMatch = raw.match(GID_RE);
  const gid = gidMatch?.[1] ?? '0';

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

export function isSheetSyncUploadName(fileName: string): boolean {
  return fileName.startsWith(SHEET_SYNC_FILE_PREFIX);
}

export type SheetMapping = ColumnMapping;

const STALE_MS = 6 * 60 * 60 * 1000;

/** True when auto-sync should run on dashboard open. */
export function shouldAutoSyncSheet(args: {
  enabled: boolean;
  lastSyncedAt: string | null | undefined;
  hasMapping: boolean;
  hasUrl: boolean;
  now?: Date;
}): boolean {
  if (!args.enabled || !args.hasUrl || !args.hasMapping) return false;
  if (!args.lastSyncedAt) return true;
  const last = new Date(args.lastSyncedAt).getTime();
  if (Number.isNaN(last)) return true;
  return (args.now ?? new Date()).getTime() - last >= STALE_MS;
}

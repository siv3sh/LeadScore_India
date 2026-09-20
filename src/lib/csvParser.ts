export interface RawLead {
  lead_id: string;
  name: string;
  phone: string;
  city: string;
  source: string;
  created_at: string;
  last_contacted_at: string | null;
  order_value: number;
  num_orders: number;
  status: string;
  /** Leftover CSV columns that were not mapped to a scoring field. */
  extra: Record<string, string>;
}

/** Name and phone are the only columns a call list cannot work without. */
export const REQUIRED_COLUMNS = ['name', 'phone'] as const;

export const OPTIONAL_COLUMNS = [
  'lead_id',
  'city',
  'source',
  'created_at',
  'last_contacted_at',
  'order_value',
  'num_orders',
  'status',
] as const;

export const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS] as const;

export const MAX_EXTRA_KEYS = 24;
export const MAX_EXTRA_VALUE_LEN = 240;
export const MAX_DISPLAY_EXTRAS = 8;

export type MappingFieldKey =
  | 'name'
  | 'phone'
  | 'source'
  | 'created_at'
  | 'status'
  | 'city'
  | 'order_value'
  | 'num_orders'
  | 'lead_id'
  | 'last_contacted_at';

export const MAPPING_FIELDS: { key: MappingFieldKey; label: string; required: boolean }[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'source', label: 'Source', required: false },
  { key: 'created_at', label: 'Created at', required: false },
  { key: 'status', label: 'Converted / not converted', required: false },
  { key: 'city', label: 'City', required: false },
  { key: 'order_value', label: 'Order value', required: false },
  { key: 'num_orders', label: 'Num orders', required: false },
  { key: 'lead_id', label: 'Lead ID', required: false },
  { key: 'last_contacted_at', label: 'Last contacted', required: false },
];

// The only source values the model one-hot encodes. Anything else scores as all-zero.
export const SOURCES = ['fb', 'ig', 'google', 'referral', 'walkin', 'other'];

// Statuses that represent a settled outcome and can therefore be trained on.
// Kept in sync with RESOLVED_STATUSES in ml.ts.
export const RESOLVED_STATUSES = ['won', 'lost', 'no_response'];

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((s) => s.trim());
}

/**
 * Statuses are compared against RESOLVED_STATUSES, which are underscored, so
 * separators have to be normalised here. A CRM exporting "No Response" would
 * otherwise be read as an open stage and dropped from training, even though it
 * is a settled outcome the model should learn from.
 */
export function normalizeStatus(value: string): string {
  return value.toLowerCase().trim().replace(/[\s-]+/g, '_') || 'unknown';
}

// created_at and last_contacted_at land in timestamptz columns, so anything
// unparseable has to become null here rather than reaching Postgres.
function normalizeTimestamp(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Flag columns encoded as 0/1 would otherwise parse as years.
  if (/^\d{1,3}$/.test(trimmed)) return null;
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
  if (delimiter === '\t') {
    return line.split('\t').map((s) => s.trim());
  }
  return parseCSVLine(line);
}

function detectDelimiter(headerLine: string): ',' | '\t' {
  const tabs = headerLine.split('\t').length;
  const commas = parseCSVLine(headerLine).length;
  // Google Sheets paste is tab-separated; prefer tabs when they yield more columns.
  return tabs > commas ? '\t' : ',';
}

export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error('CSV file is empty');

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseDelimitedLine(lines[0], delimiter).map((h) => h.toLowerCase().trim());
  const rows = lines.slice(1).map((line) => parseDelimitedLine(line, delimiter));
  return { headers, rows };
}

export interface ColumnMapping {
  lead_id?: string;
  name?: string;
  phone?: string;
  source?: string;
  city?: string;
  created_at?: string;
  last_contacted_at?: string;
  order_value?: string;
  num_orders?: string;
  status?: string;
}

type AliasRule = {
  exact: string[];
  contains: string[];
  exclude: string[];
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[\s-]+/g, '_');
}

function matchesToken(normalized: string, token: string): boolean {
  return normalized === token || normalized.endsWith(`_${token}`) || normalized.startsWith(`${token}_`);
}

function scoreHeader(normalized: string, rule: AliasRule): number {
  if (rule.exclude.some((token) => matchesToken(normalized, token))) return 0;
  if (rule.exact.includes(normalized)) return 100;
  for (const token of rule.contains) {
    if (matchesToken(normalized, token)) return 80;
  }
  return 0;
}

function pickHeader(headers: string[], rule: AliasRule, used: Set<string>): string | undefined {
  let best: { header: string; score: number } | undefined;
  for (const header of headers) {
    if (!header || used.has(header)) continue;
    const score = scoreHeader(normalizeHeader(header), rule);
    if (score > 0 && (!best || score > best.score)) {
      best = { header, score };
    }
  }
  return best?.header;
}

const NAME_RULE: AliasRule = {
  exact: ['name', 'full_name', 'customer_name', 'client_name', 'lead_name', 'contact_name', 'your_name'],
  contains: ['full_name', 'customer', 'client', 'lead_name'],
  exclude: ['ad_name', 'adset_name', 'campaign_name', 'form_name', 'page_name', 'audience_name', 'conversion_name'],
};

const PHONE_RULE: AliasRule = {
  exact: ['phone', 'phone_number', 'mobile', 'mobile_number', 'whatsapp', 'whatsapp_number', 'tel', 'telephone'],
  contains: ['phone', 'mobile', 'whatsapp'],
  exclude: ['phone_consent', 'consent'],
};

const SOURCE_RULE: AliasRule = {
  exact: ['source', 'channel', 'origin', 'platform', 'utm_source', 'medium'],
  contains: ['source', 'channel', 'platform'],
  exclude: ['resource'],
};

const CREATED_RULE: AliasRule = {
  exact: ['created_at', 'created_time', 'created', 'date', 'timestamp', 'lead_date', 'submitted_at', 'date_created'],
  contains: ['created', 'submitted', 'timestamp', 'lead_date'],
  exclude: ['last_contact', 'conversion_time', 'updated'],
};

const STATUS_RULE: AliasRule = {
  exact: ['status', 'stage', 'outcome', 'result', 'converted', 'conversion_status'],
  contains: ['status', 'outcome', 'converted'],
  exclude: ['conversion_value', 'conversion_time', 'conversion_name', 'conversion_currency', 'lead_status'],
};

const CITY_RULE: AliasRule = {
  exact: ['city', 'location', 'town', 'district'],
  contains: ['city', 'town', 'district'],
  exclude: ['location_id'],
};

const LEAD_ID_RULE: AliasRule = {
  exact: ['lead_id', 'leadid', 'id'],
  contains: ['lead_id'],
  exclude: ['ad_id', 'adset_id', 'campaign_id', 'form_id', 'page_id', 'click_id', 'gclid'],
};

const LAST_CONTACT_RULE: AliasRule = {
  exact: ['last_contacted_at', 'last_contact', 'last_touch', 'contacted_at', 'contacted_on', 'contact_date'],
  contains: ['last_contact', 'last_touch', 'contacted_at'],
  exclude: ['phone'],
};

const ORDER_VALUE_RULE: AliasRule = {
  exact: ['order_value', 'value', 'amount', 'revenue', 'aov'],
  contains: ['order_value', 'revenue', 'amount'],
  exclude: ['conversion_value', 'num_orders'],
};

const NUM_ORDERS_RULE: AliasRule = {
  exact: ['num_orders', 'orders', 'order_count', 'purchases'],
  contains: ['num_orders', 'order_count', 'purchases'],
  exclude: ['order_value'],
};

/**
 * Matches messy real-world headers (Instagram ads, Google Sheets, WhatsApp
 * exports) onto scoring fields. Unmapped columns are kept as extras — the
 * call list does not require a fixed template.
 */
export function guessColumnMapping(headers: string[]): ColumnMapping {
  const used = new Set<string>();
  const take = (rule: AliasRule): string | undefined => {
    const header = pickHeader(headers, rule, used);
    if (header) used.add(header);
    return header;
  };

  const mapping: ColumnMapping = {
    name: take(NAME_RULE),
    phone: take(PHONE_RULE),
    source: take(SOURCE_RULE),
    created_at: take(CREATED_RULE),
    status: take(STATUS_RULE),
    city: take(CITY_RULE),
    lead_id: take(LEAD_ID_RULE),
    last_contacted_at: take(LAST_CONTACT_RULE),
    order_value: take(ORDER_VALUE_RULE),
    num_orders: take(NUM_ORDERS_RULE),
  };

  if (!mapping.name) {
    const firstName = pickHeader(headers, { exact: ['first_name', 'firstname'], contains: ['first_name'], exclude: [] }, used);
    if (firstName) {
      mapping.name = firstName;
      used.add(firstName);
    }
  }

  if (!mapping.name) {
    const fallback = headers.find((header) => header && !used.has(header));
    if (fallback) mapping.name = fallback;
  }
  if (!mapping.phone) {
    const fallback = headers.find((header) => header && !used.has(header) && header !== mapping.name);
    if (fallback) mapping.phone = fallback;
  }

  return mapping;
}

export function mappedHeaders(mapping: ColumnMapping): Set<string> {
  const used = new Set<string>();
  for (const value of Object.values(mapping)) {
    if (value) used.add(value);
  }
  return used;
}

export function unmappedHeaders(headers: string[], mapping: ColumnMapping): string[] {
  const used = mappedHeaders(mapping);
  return headers.filter((header) => header && !used.has(header));
}

export function parseLeadExtra(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const extra: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key.trim()) continue;
    if (typeof raw !== 'string' && typeof raw !== 'number') continue;
    const text = String(raw).trim();
    if (!text) continue;
    extra[key] = text.slice(0, MAX_EXTRA_VALUE_LEN);
    if (Object.keys(extra).length >= MAX_EXTRA_KEYS) break;
  }
  return extra;
}

export function collectExtraKeys(leads: Array<{ extra?: unknown }>): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const lead of leads) {
    for (const key of Object.keys(parseLeadExtra(lead.extra))) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
      if (keys.length >= MAX_EXTRA_KEYS) return keys;
    }
  }
  return keys;
}

export function formatExtraLabel(key: string): string {
  const cleaned = key.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return key;
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

const SKIP_DISPLAY_EXTRA = /(^id$|_id$|^is_|organic|token|click_id|gclid)/;
const PREFERRED_EXTRAS = [
  'email',
  'campaign',
  'ad_name',
  'form',
  'product',
  'budget',
  'city',
  'interest',
  'message',
  'company',
];

/** First extras worth showing on a call list; skip ids and ad-system flags. */
export function suggestDisplayExtras(keys: string[]): string[] {
  const usable = keys.filter((key) => !SKIP_DISPLAY_EXTRA.test(normalizeHeader(key)));
  const ranked = [...usable].sort((a, b) => {
    const rankA = PREFERRED_EXTRAS.findIndex((token) => normalizeHeader(a).includes(token));
    const rankB = PREFERRED_EXTRAS.findIndex((token) => normalizeHeader(b).includes(token));
    return (rankA === -1 ? 99 : rankA) - (rankB === -1 ? 99 : rankB);
  });
  return ranked.slice(0, 3);
}

function normalizePhone(value: string): string {
  return value.trim().replace(/^p:/i, '').trim();
}

function normalizeSource(value: string): string {
  const trimmed = value.toLowerCase().trim();
  if (!trimmed) return 'other';
  if (trimmed === 'facebook' || trimmed === 'facebook ads' || trimmed === 'meta' || trimmed === 'fb ads') {
    return 'fb';
  }
  if (trimmed === 'instagram' || trimmed === 'instagram ads' || trimmed === 'ig ads') return 'ig';
  if (trimmed === 'google ads' || trimmed === 'google_ads' || trimmed === 'gads') return 'google';
  if (trimmed === 'walk-in' || trimmed === 'walk_in' || trimmed === 'store') return 'walkin';
  return trimmed;
}

function lastNameHeader(headers: string[], mapping: ColumnMapping): string | undefined {
  const used = mappedHeaders(mapping);
  return headers.find((header) => {
    if (!header || used.has(header)) return false;
    const normalized = normalizeHeader(header);
    return normalized === 'last_name' || normalized === 'lastname';
  });
}

function buildExtra(
  headers: string[],
  row: string[],
  skip: Set<string>
): Record<string, string> {
  const extra: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (!header || skip.has(header)) continue;
    const value = (i < row.length ? row[i] : '').trim().slice(0, MAX_EXTRA_VALUE_LEN);
    if (!value) continue;
    extra[header] = value;
    if (Object.keys(extra).length >= MAX_EXTRA_KEYS) break;
  }
  return extra;
}

export function mapRowsToLeadsWithHeaders(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping
): RawLead[] {
  const getIndex = (colName: string | undefined): number => {
    if (!colName) return -1;
    return headers.indexOf(colName);
  };

  const lastNameCol = lastNameHeader(headers, mapping);
  const idx = {
    lead_id: getIndex(mapping.lead_id),
    name: getIndex(mapping.name),
    lastName: getIndex(lastNameCol),
    phone: getIndex(mapping.phone),
    city: getIndex(mapping.city),
    source: getIndex(mapping.source),
    created_at: getIndex(mapping.created_at),
    last_contacted_at: getIndex(mapping.last_contacted_at),
    order_value: getIndex(mapping.order_value),
    num_orders: getIndex(mapping.num_orders),
    status: getIndex(mapping.status),
  };

  const skipExtra = mappedHeaders(mapping);
  if (lastNameCol) skipExtra.add(lastNameCol);

  return rows.map((row, i) => {
    const getVal = (index: number): string => (index >= 0 && index < row.length ? row[index] : '');
    const parseNum = (s: string, def = 0): number => {
      const n = parseFloat(s.replace(/[^0-9.-]/g, ''));
      return isNaN(n) ? def : n;
    };

    const first = getVal(idx.name).trim();
    const last = getVal(idx.lastName).trim();
    const name = [first, last].filter(Boolean).join(' ') || 'Unknown';

    return {
      lead_id: getVal(idx.lead_id) || `lead_${i + 1}`,
      name,
      phone: normalizePhone(getVal(idx.phone)),
      city: getVal(idx.city).trim(),
      source: normalizeSource(getVal(idx.source)),
      created_at: normalizeTimestamp(getVal(idx.created_at)) ?? new Date().toISOString(),
      last_contacted_at: normalizeTimestamp(getVal(idx.last_contacted_at)),
      order_value: parseNum(getVal(idx.order_value)),
      num_orders: parseInt(getVal(idx.num_orders), 10) || 0,
      status: normalizeStatus(getVal(idx.status)),
      extra: buildExtra(headers, row, skipExtra),
    };
  });
}

export interface StatusBreakdown {
  /** Settled outcomes, which the model can learn from. */
  trainable: { value: string; count: number }[];
  /** Open pipeline stages: scored, but excluded from training. */
  open: { value: string; count: number }[];
  wonCount: number;
}

/**
 * Lets the mapping step show which of the file's own status values count as
 * outcomes, instead of letting the user discover after scoring that a CRM
 * export of New / Contacted / Follow Up gave the model nothing to learn from.
 */
export function summarizeStatuses(
  headers: string[],
  rows: string[][],
  statusColumn: string | undefined
): StatusBreakdown {
  const empty: StatusBreakdown = { trainable: [], open: [], wonCount: 0 };
  if (!statusColumn) return empty;

  const index = headers.indexOf(statusColumn);
  if (index < 0) return empty;

  const counts = new Map<string, number>();
  for (const row of rows) {
    // Shares normalizeStatus with mapRowsToLeadsWithHeaders, or the preview
    // would disagree with what actually gets scored.
    const value = normalizeStatus(index < row.length ? row[index] : '');
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const byCountDesc = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);

  return {
    trainable: byCountDesc.filter((entry) => RESOLVED_STATUSES.includes(entry.value)),
    open: byCountDesc.filter((entry) => !RESOLVED_STATUSES.includes(entry.value)),
    wonCount: counts.get('won') ?? 0,
  };
}

export interface LeadValidation {
  error: string | null;
  warnings: string[];
}

/**
 * Warns on mappings that leave the model with nothing useful to learn from.
 * A file with no converted rows is still ranked (source + recency) rather than
 * rejected — Instagram ads exports never carry a converted column.
 */
export function validateLeadsForScoring(leads: RawLead[]): LeadValidation {
  const warnings: string[] = [];

  if (!leads.some((l) => l.status === 'won')) {
    warnings.push(
      'No converted leads in this file, so ranking uses source and how recently they arrived — not your past wins. ' +
        'Add a converted / not converted column later if you want a model trained on your results.'
    );
  }

  const unrecognizedSources: string[] = [];
  for (const lead of leads) {
    if (!SOURCES.includes(lead.source)) {
      unrecognizedSources.push(lead.source);
    }
  }

  if (unrecognizedSources.length > 0) {
    const percent = Math.round((unrecognizedSources.length / leads.length) * 100);
    const examples: string[] = [];
    const seen = new Set<string>();
    for (const value of unrecognizedSources) {
      const label = value.trim() === '' ? '(blank)' : value;
      if (seen.has(label)) continue;
      seen.add(label);
      examples.push(label);
      if (examples.length === 3) break;
    }
    const exampleText = examples.length > 0 ? ` Examples: ${examples.join(', ')}.` : '';
    warnings.push(
      `${unrecognizedSources.length} of ${leads.length} leads (${percent}%) have a source ` +
        `that is not ${SOURCES.join(', ')}, so those rows are scored without a source signal.` +
        exampleText
    );
  }

  if (!leads.some((l) => RESOLVED_STATUSES.includes(l.status) && l.status !== 'won')) {
    warnings.push(
      'Every lead with a settled outcome is marked converted, so the model has no examples of a lead ' +
        'that did not convert and cannot tell the two apart. Include not converted / no response leads too.'
    );
  }

  return { error: null, warnings };
}

/**
 * The column order both generated files use. Rows are written from objects
 * keyed by these names, so a row can never silently drift out of alignment
 * with the header.
 */
const CSV_COLUMNS = [
  'lead_id',
  'name',
  'phone',
  'city',
  'source',
  'created_at',
  'last_contacted_at',
  'order_value',
  'num_orders',
  'status',
] as const;

type CSVRow = Partial<Record<(typeof CSV_COLUMNS)[number], string | number>>;

function toCSV(rows: CSVRow[]): string {
  const escape = (value: string | number | undefined): string => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [
    CSV_COLUMNS.join(','),
    ...rows.map((row) => CSV_COLUMNS.map((column) => escape(row[column])).join(',')),
  ].join('\n');
}

const SAMPLE_CITIES = ['Mumbai', 'Delhi NCR', 'Bengaluru', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Kochi', 'Chandigarh', 'Jaipur'];

/**
 * The header row on its own, for pasting real data underneath. Deliberately
 * carries no example rows, so nothing has to be deleted before use and no
 * invented lead can reach the scorer by accident.
 *
 * The accepted `source` and `status` values are therefore not visible in the
 * file; the upload step states them instead. generateSampleCSV is the one that
 * carries data, for trying the product out.
 */
export function generateTemplateCSV(): string {
  return toCSV([]);
}

export function generateSampleCSV(): string {
  const statuses = [...RESOLVED_STATUSES, 'unknown'];
  const names = ['Aarav Sharma', 'Vivaan Gupta', 'Aditya Verma', 'Vihaan Reddy', 'Arjun Singh', 'Sai Patel', 'Reyansh Kumar', 'Ayaan Mehta', 'Krishna Nair', 'Ishaan Joshi', 'Ananya Rao', 'Diya Iyer', 'Saanvi Menon', 'Aadhya Pillai', 'Kiara Nair', 'Myra Sharma', 'Anika Reddy', 'Pari Gupta', 'Riya Das', 'Sara Khan'];

  const now = Date.now();
  const rows: CSVRow[] = [];
  for (let i = 0; i < 50; i++) {
    const hasContact = Math.random() > 0.4;
    rows.push({
      lead_id: `L${i + 1}`,
      name: names[i % names.length],
      phone: `+91${Math.floor(60000 + Math.random() * 39999)}${Math.floor(10000 + Math.random() * 89999)}`,
      city: SAMPLE_CITIES[Math.floor(Math.random() * SAMPLE_CITIES.length)],
      source: SOURCES[Math.floor(Math.random() * SOURCES.length)],
      created_at: new Date(now - Math.floor(Math.random() * 60) * 86400000).toISOString(),
      last_contacted_at: hasContact
        ? new Date(now - Math.floor(Math.random() * 30) * 86400000).toISOString()
        : '',
      order_value: Math.random() > 0.5 ? Math.floor(Math.random() * 5000) + 200 : 0,
      num_orders: Math.random() > 0.6 ? Math.floor(Math.random() * 5) + 1 : 0,
      status: statuses[Math.floor(Math.random() * statuses.length)],
    });
  }
  return toCSV(rows);
}

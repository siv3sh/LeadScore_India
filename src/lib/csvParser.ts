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
}

export const REQUIRED_COLUMNS = [
  'name',
  'phone',
  'source',
  'created_at',
  'order_value',
  'num_orders',
  'status',
] as const;

export const OPTIONAL_COLUMNS = ['lead_id', 'city', 'last_contacted_at'] as const;

export const ALL_COLUMNS = [...OPTIONAL_COLUMNS, ...REQUIRED_COLUMNS] as const;

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

export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error('CSV file is empty');

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const rows = lines.slice(1).map((line) => parseCSVLine(line));
  return { headers, rows };
}

export interface ColumnMapping {
  lead_id?: string;
  name: string;
  phone: string;
  source: string;
  city?: string;
  created_at: string;
  last_contacted_at?: string;
  order_value: string;
  num_orders: string;
  status: string;
}

export function guessColumnMapping(headers: string[]): ColumnMapping {
  const findCol = (candidates: string[]): string | undefined => {
    return headers.find((h) => candidates.some((c) => h.includes(c)));
  };

  return {
    lead_id: findCol(['lead_id', 'leadid', 'id']),
    name: findCol(['name', 'customer', 'client']) ?? headers[0],
    phone: findCol(['phone', 'mobile', 'number', 'contact']) ?? headers[1],
    city: findCol(['city', 'location', 'town', 'district']),
    source: findCol(['source', 'channel', 'origin']) ?? 'source',
    created_at: findCol(['created', 'date', 'timestamp', 'lead_date']) ?? 'created_at',
    last_contacted_at: findCol(['last_contact', 'last_touch', 'contacted_at', 'contacted_on', 'contact_date']) ?? undefined,
    order_value: findCol(['order_value', 'value', 'amount', 'revenue', 'aov']) ?? 'order_value',
    num_orders: findCol(['num_orders', 'orders', 'order_count', 'purchases']) ?? 'num_orders',
    status: findCol(['status', 'stage', 'outcome', 'result']) ?? 'status',
  };
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

  const idx = {
    lead_id: getIndex(mapping.lead_id),
    name: getIndex(mapping.name),
    phone: getIndex(mapping.phone),
    city: getIndex(mapping.city),
    source: getIndex(mapping.source),
    created_at: getIndex(mapping.created_at),
    last_contacted_at: getIndex(mapping.last_contacted_at),
    order_value: getIndex(mapping.order_value),
    num_orders: getIndex(mapping.num_orders),
    status: getIndex(mapping.status),
  };

  return rows.map((row, i) => {
    const getVal = (i: number): string => (i >= 0 && i < row.length ? row[i] : '');
    const parseNum = (s: string, def = 0): number => {
      const n = parseFloat(s.replace(/[^0-9.-]/g, ''));
      return isNaN(n) ? def : n;
    };

    return {
      lead_id: getVal(idx.lead_id) || `lead_${i + 1}`,
      name: getVal(idx.name) || 'Unknown',
      phone: getVal(idx.phone) || '',
      city: getVal(idx.city).trim(),
      source: getVal(idx.source).toLowerCase().trim() || 'other',
      created_at: normalizeTimestamp(getVal(idx.created_at)) ?? new Date().toISOString(),
      last_contacted_at: normalizeTimestamp(getVal(idx.last_contacted_at)),
      order_value: parseNum(getVal(idx.order_value)),
      num_orders: parseInt(getVal(idx.num_orders)) || 0,
      status: normalizeStatus(getVal(idx.status)),
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
 * Catches mappings that produce a model with nothing to learn from. The label is
 * derived solely from `status === 'won'`, so a file with no won rows trains on an
 * all-zero target and scores every lead identically instead of failing.
 */
export function validateLeadsForScoring(leads: RawLead[]): LeadValidation {
  const warnings: string[] = [];

  if (!leads.some((l) => l.status === 'won')) {
    return {
      error:
        "No leads have status 'won', so there is nothing for the model to learn from. " +
        'Map your outcome column to "status" using won / lost / no_response values, then upload again.',
      warnings,
    };
  }

  if (!leads.some((l) => SOURCES.includes(l.source))) {
    warnings.push(
      `No lead source matched ${SOURCES.join(', ')}, so source is being ignored when scoring.`
    );
  }

  if (!leads.some((l) => RESOLVED_STATUSES.includes(l.status) && l.status !== 'won')) {
    warnings.push(
      'Every lead with a settled outcome is marked won, so the model has no examples of a lead ' +
        'that did not convert and cannot tell the two apart. Include lost / no_response leads too.'
    );
  }

  return { error: null, warnings };
}

export function generateSampleCSV(): string {
  const headers = ['lead_id', 'name', 'phone', 'city', 'source', 'created_at', 'last_contacted_at', 'order_value', 'num_orders', 'status'];
  const sources = ['fb', 'ig', 'google', 'referral', 'walkin', 'other'];
  const statuses = ['won', 'lost', 'no_response', 'unknown'];
  const cities = ['Mumbai', 'Delhi NCR', 'Bengaluru', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Kochi', 'Chandigarh', 'Jaipur'];
  const names = ['Aarav Sharma', 'Vivaan Gupta', 'Aditya Verma', 'Vihaan Reddy', 'Arjun Singh', 'Sai Patel', 'Reyansh Kumar', 'Ayaan Mehta', 'Krishna Nair', 'Ishaan Joshi', 'Ananya Rao', 'Diya Iyer', 'Saanvi Menon', 'Aadhya Pillai', 'Kiara Nair', 'Myra Sharma', 'Anika Reddy', 'Pari Gupta', 'Riya Das', 'Sara Khan'];

  const rows: string[] = [headers.join(',')];
  const now = Date.now();
  for (let i = 0; i < 50; i++) {
    const name = names[i % names.length];
    const phone = `+91${Math.floor(60000 + Math.random() * 39999)}${Math.floor(10000 + Math.random() * 89999)}`;
    const source = sources[Math.floor(Math.random() * sources.length)];
    const created = new Date(now - Math.floor(Math.random() * 60) * 86400000).toISOString();
    const hasContact = Math.random() > 0.4;
    const lastContact = hasContact ? new Date(now - Math.floor(Math.random() * 30) * 86400000).toISOString() : '';
    const orderValue = Math.random() > 0.5 ? Math.floor(Math.random() * 5000) + 200 : 0;
    const numOrders = Math.random() > 0.6 ? Math.floor(Math.random() * 5) + 1 : 0;
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const city = cities[Math.floor(Math.random() * cities.length)];
    rows.push([`L${i + 1}`, name, phone, city, source, created, lastContact, orderValue, numOrders, status].join(','));
  }
  return rows.join('\n');
}

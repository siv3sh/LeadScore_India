export interface RawLead {
  lead_id: string;
  name: string;
  phone: string;
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

export const OPTIONAL_COLUMNS = ['lead_id', 'last_contacted_at'] as const;

export const ALL_COLUMNS = [...OPTIONAL_COLUMNS, ...REQUIRED_COLUMNS] as const;

export const SAMPLE_SOURCES = ['fb', 'ig', 'google', 'referral', 'walkin', 'other'];

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
    source: findCol(['source', 'channel', 'origin']) ?? 'source',
    created_at: findCol(['created', 'date', 'timestamp', 'lead_date']) ?? 'created_at',
    last_contacted_at: findCol(['last_contact', 'last_touch', 'contacted']) ?? undefined,
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
      source: getVal(idx.source).toLowerCase().trim() || 'other',
      created_at: getVal(idx.created_at) || new Date().toISOString(),
      last_contacted_at: getVal(idx.last_contacted_at) || null,
      order_value: parseNum(getVal(idx.order_value)),
      num_orders: parseInt(getVal(idx.num_orders)) || 0,
      status: getVal(idx.status).toLowerCase().trim() || 'unknown',
    };
  });
}

export function generateSampleCSV(): string {
  const headers = ['lead_id', 'name', 'phone', 'source', 'created_at', 'last_contacted_at', 'order_value', 'num_orders', 'status'];
  const sources = ['fb', 'ig', 'google', 'referral', 'walkin', 'other'];
  const statuses = ['won', 'lost', 'no_response', 'unknown'];
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
    rows.push([`L${i + 1}`, name, phone, source, created, lastContact, orderValue, numOrders, status].join(','));
  }
  return rows.join('\n');
}

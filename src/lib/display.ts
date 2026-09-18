import type { Priority } from '@/types';

/** Friendly names for the sources the model one-hot encodes. */
const SOURCE_LABELS: Record<string, string> = {
  fb: 'Facebook Ads',
  ig: 'Instagram',
  google: 'Google Search',
  referral: 'Referral',
  walkin: 'Walk-in',
  other: 'Other',
};

export function formatSource(source: string | null): string {
  if (!source) return '—';
  const known = SOURCE_LABELS[source.toLowerCase()];
  if (known) return known;
  // An unrecognised source still needs to read like a label, not a slug.
  return source
    .split(/[_\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface StatusStyle {
  label: string;
  className: string;
}

/**
 * Covers both pipeline stages a CRM exports and the settled outcomes the model
 * trains on. Anything unrecognised falls back to neutral styling rather than
 * being hidden.
 */
const STATUS_STYLES: Record<string, StatusStyle> = {
  new: { label: 'New', className: 'text-sky-700 bg-sky-50 border-sky-200' },
  contacted: { label: 'Contacted', className: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  follow_up: { label: 'Follow-up', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  qualified: { label: 'Qualified', className: 'text-violet-700 bg-violet-50 border-violet-200' },
  won: { label: 'Converted', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  lost: { label: 'Not converted', className: 'text-red-700 bg-red-50 border-red-200' },
  no_response: { label: 'No response', className: 'text-slate-600 bg-slate-50 border-slate-200' },
  unknown: { label: 'Open', className: 'text-slate-600 bg-slate-50 border-slate-200' },
};

export function formatStatus(status: string | null): StatusStyle {
  if (!status) return STATUS_STYLES.unknown;
  const key = status.toLowerCase().trim().replace(/[\s-]+/g, '_');
  return (
    STATUS_STYLES[key] ?? {
      label: formatSource(status),
      className: 'text-slate-600 bg-slate-50 border-slate-200',
    }
  );
}

export const PRIORITY_STYLES: Record<Priority, { label: string; dot: string; className: string }> = {
  high: {
    label: 'High',
    dot: 'bg-emerald-500',
    className: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  medium: {
    label: 'Medium',
    dot: 'bg-amber-500',
    className: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  low: {
    label: 'Low',
    dot: 'bg-slate-400',
    className: 'text-slate-600 bg-slate-50 border-slate-200',
  },
};

/** Whole rupees — lead values are never precise enough to warrant paise. */
export function formatINR(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/**
 * wa.me needs a country code and digits only. Returns null when the number
 * cannot be trusted, so the caller can disable the button instead of opening a
 * broken chat.
 */
export function whatsappNumber(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  // Any other length is either an international number we cannot infer a code
  // for, or junk.
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** tel: URIs must not contain spaces or formatting characters. */
export function telLink(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned.replace(/\D/g, '').length >= 6 ? `tel:${cleaned}` : null;
}

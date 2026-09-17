import { describe, expect, it } from 'vitest';
import {
  PRIORITY_STYLES,
  formatINR,
  formatSource,
  formatStatus,
  telLink,
  whatsappNumber,
} from './display';

describe('formatSource', () => {
  it('labels every source the model one-hot encodes', () => {
    expect(formatSource('fb')).toBe('Facebook Ads');
    expect(formatSource('ig')).toBe('Instagram');
    expect(formatSource('google')).toBe('Google Search');
    expect(formatSource('referral')).toBe('Referral');
    expect(formatSource('walkin')).toBe('Walk-in');
    expect(formatSource('other')).toBe('Other');
  });

  it('matches regardless of casing', () => {
    expect(formatSource('FB')).toBe('Facebook Ads');
    expect(formatSource('Referral')).toBe('Referral');
  });

  it('title-cases an unrecognised source instead of showing a raw slug', () => {
    expect(formatSource('linkedin_ads')).toBe('Linkedin Ads');
    expect(formatSource('trade-show')).toBe('Trade Show');
    expect(formatSource('justdial')).toBe('Justdial');
  });

  it('falls back to a dash when there is no source', () => {
    expect(formatSource(null)).toBe('—');
    expect(formatSource('')).toBe('—');
  });
});

describe('formatStatus', () => {
  it('styles the settled outcomes the model trains on', () => {
    expect(formatStatus('won').label).toBe('Won');
    expect(formatStatus('lost').label).toBe('Lost');
    expect(formatStatus('no_response').label).toBe('No Response');
  });

  it('styles the open pipeline stages a CRM exports', () => {
    expect(formatStatus('new').label).toBe('New');
    expect(formatStatus('contacted').label).toBe('Contacted');
    expect(formatStatus('follow_up').label).toBe('Follow Up');
    expect(formatStatus('qualified').label).toBe('Qualified');
  });

  // Same separator normalisation as normalizeStatus in csvParser, so a CRM
  // exporting "No Response" is styled as the outcome rather than as unknown.
  it('normalises spaces and hyphens before matching', () => {
    expect(formatStatus('No Response').label).toBe('No Response');
    expect(formatStatus('Follow-Up').label).toBe('Follow Up');
    expect(formatStatus('  WON  ').label).toBe('Won');
  });

  it('shows an unrecognised status neutrally rather than hiding it', () => {
    const styled = formatStatus('negotiating');
    expect(styled.label).toBe('Negotiating');
    expect(styled.className).toContain('slate');
  });

  it('treats a missing status as unknown', () => {
    expect(formatStatus(null).label).toBe('Unknown');
  });
});

describe('formatINR', () => {
  it('groups in lakhs, not thousands', () => {
    expect(formatINR(1000)).toBe('₹1,000');
    expect(formatINR(123456)).toBe('₹1,23,456');
    expect(formatINR(1234567)).toBe('₹12,34,567');
  });

  it('rounds to whole rupees', () => {
    expect(formatINR(1999.4)).toBe('₹1,999');
    expect(formatINR(1999.5)).toBe('₹2,000');
  });

  it('handles zero', () => {
    expect(formatINR(0)).toBe('₹0');
  });
});

describe('whatsappNumber', () => {
  it('adds the country code to a bare 10-digit Indian mobile', () => {
    expect(whatsappNumber('9876543210')).toBe('919876543210');
  });

  it('strips formatting before reading the digits', () => {
    expect(whatsappNumber('+91 98765 43210')).toBe('919876543210');
    expect(whatsappNumber('(98765) 43210')).toBe('919876543210');
  });

  it('drops the trunk zero from an 11-digit number', () => {
    expect(whatsappNumber('09876543210')).toBe('919876543210');
  });

  it('leaves an already-prefixed number alone', () => {
    expect(whatsappNumber('919876543210')).toBe('919876543210');
  });

  it('passes through a plausible international number', () => {
    expect(whatsappNumber('441234567890')).toBe('441234567890');
  });

  // The caller disables the button on null, so junk must not produce a link.
  it('rejects numbers too short or too long to be real', () => {
    expect(whatsappNumber('12345')).toBeNull();
    expect(whatsappNumber('1234567890123456')).toBeNull();
    expect(whatsappNumber('not a phone')).toBeNull();
    expect(whatsappNumber('')).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });
});

describe('telLink', () => {
  it('keeps the plus sign and drops everything else', () => {
    expect(telLink('+91 98765-43210')).toBe('tel:+919876543210');
  });

  it('handles a landline with an area code', () => {
    expect(telLink('(022) 4567-8900')).toBe('tel:02245678900');
  });

  it('rejects anything too short to dial', () => {
    expect(telLink('12345')).toBeNull();
    expect(telLink('n/a')).toBeNull();
    expect(telLink('')).toBeNull();
    expect(telLink(null)).toBeNull();
  });
});

describe('PRIORITY_STYLES', () => {
  it('covers every priority the scorer can assign', () => {
    expect(Object.keys(PRIORITY_STYLES).sort()).toEqual(['high', 'low', 'medium']);
  });
});

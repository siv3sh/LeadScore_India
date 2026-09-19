/**
 * Business details shown on the legal pages.
 *
 * Razorpay checks these against your registered account before activating live
 * payments, and the Digital Personal Data Protection Act expects a reachable
 * contact for data requests. Keep them accurate — they are the only place in
 * the app that makes a legal claim about who is selling the service.
 */

/** Set once the business is registered for GST; shown on the terms page when present. */
const GSTIN: string | null = null;

export const COMPANY = {
  /** The name the service trades under (shown in product UI). */
  tradeName: 'LeadScore',
  /**
   * Prior public name — same product. Keep so people who received LeadAI links
   * still recognize the brand; both leadai.* and leadscore.* host this app.
   */
  formerTradeName: 'LeadAI',
  /**
   * The entity that actually takes the money. Must match the account name
   * registered with Razorpay, or payouts fail verification.
   */
  legalName: 'Sivesh PB',
  address: {
    line1: 'Shornur',
    city: 'Palakkad',
    state: 'Kerala',
    pincode: '679122',
    country: 'India',
  },
  supportEmail: 'hello@sivesh-pb.com',
  /** Razorpay expects a reachable number for customer disputes. */
  supportPhone: '+91 79078 40071',
  gstin: GSTIN,
  /** Working days within which support aims to reply. */
  supportResponseDays: 2,
  /** Days after a payment during which an unused plan can be refunded. */
  refundWindowDays: 7,
} as const;

/** The legal pages, linked from the auth screen and the dashboard footer. */
export const LEGAL_LINKS = [
  { to: '/terms', label: 'Terms' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/refunds', label: 'Refunds' },
  { to: '/contact', label: 'Contact' },
] as const;

export function formattedAddress(): string {
  const { line1, city, state, pincode, country } = COMPANY.address;
  return `${line1}, ${city}, ${state} ${pincode}, ${country}`;
}

/** True while any placeholder is still unconfirmed, so the app can say so. */
export function hasUnconfirmedDetails(): boolean {
  const values = [
    COMPANY.legalName,
    COMPANY.supportPhone,
    ...Object.values(COMPANY.address),
  ];
  return values.some((value) => value.startsWith('CONFIRM:'));
}

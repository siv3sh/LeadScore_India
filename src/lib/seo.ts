import { COMPANY } from '@/lib/company';

/** Primary public URL. */
export const SITE_URL = 'https://leadscore.nuential.com';

export const DEFAULT_TITLE =
  `${COMPANY.tradeName} India — Rank Google Sheet leads for WhatsApp & calls`;
export const DEFAULT_DESCRIPTION =
  'Not a CRM. Upload a CSV or Google Sheet, get a ranked call and WhatsApp list for Indian small businesses — who to contact first from your own past leads.';

const ROUTE_SEO: Record<
  string,
  { title: string; description: string; robots?: string }
> = {
  '/': {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  '/login': {
    title: `Sign in — ${COMPANY.tradeName}`,
    description: `Sign in to ${COMPANY.tradeName} to see today's prioritized lead list.`,
    robots: 'noindex,nofollow',
  },
  '/signup': {
    title: `Start free trial — ${COMPANY.tradeName} India`,
    description: `Create a ${COMPANY.tradeName} account. Upload a Sheet or CSV, get a ranked WhatsApp and call list. Built for Indian SMBs — not a CRM.`,
  },
  '/terms': {
    title: `Terms of Service — ${COMPANY.tradeName}`,
    description: `Terms of service for ${COMPANY.tradeName}, operated by ${COMPANY.legalName}.`,
  },
  '/privacy': {
    title: `Privacy Policy — ${COMPANY.tradeName}`,
    description: `How ${COMPANY.tradeName} collects and uses your data under India's DPDP Act.`,
  },
  '/refunds': {
    title: `Refund Policy — ${COMPANY.tradeName}`,
    description: `Refund policy for ${COMPANY.tradeName} paid plans.`,
  },
  '/contact': {
    title: `Contact — ${COMPANY.tradeName}`,
    description: `Contact ${COMPANY.tradeName} support at ${COMPANY.supportEmail}.`,
  },
  '/guides/whatsapp-lead-list-india': {
    title: `WhatsApp lead list India — ${COMPANY.tradeName}`,
    description:
      'Turn a messy lead sheet into a daily WhatsApp and call order for Indian SMBs — without a full CRM.',
  },
  '/guides/rank-leads-google-sheet': {
    title: `Rank leads from Google Sheet — ${COMPANY.tradeName}`,
    description:
      'Connect a Google Sheet, sync leads, get a ranked call list. Keep your Sheet as the source of truth.',
  },
  '/guides/call-list-from-excel-india': {
    title: `Call list from Excel India — ${COMPANY.tradeName}`,
    description:
      'Upload an Excel or CSV export and get a prioritized call and WhatsApp list. Built for Indian sales teams.',
  },
};

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

/** Updates document title and meta for the current path (SPA-friendly). */
export function applyRouteSeo(pathname: string): void {
  const path = pathname.split('?')[0] || '/';
  const seo = ROUTE_SEO[path] ?? {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    robots: path.startsWith('/admin') ? 'noindex,nofollow' : undefined,
  };

  document.title = seo.title;
  upsertMeta('name', 'description', seo.description);
  upsertMeta('name', 'robots', seo.robots ?? 'index,follow');
  upsertMeta('property', 'og:title', seo.title);
  upsertMeta('property', 'og:description', seo.description);
  upsertMeta('property', 'og:url', `${SITE_URL}${path === '/' ? '' : path}`);
  upsertMeta('name', 'twitter:title', seo.title);
  upsertMeta('name', 'twitter:description', seo.description);
  upsertLink('canonical', `${SITE_URL}${path === '/' ? '' : path}`);
}

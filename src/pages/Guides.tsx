import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { COMPANY, LEGAL_LINKS } from '@/lib/company';
import { TRIAL_DAYS } from '@/lib/trial';
import { getPlan } from '@/types';

const FREE = getPlan('free');

function GuideLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" className="min-w-0">
            <BrandLogo size={32} />
          </Link>
          <Link
            to="/"
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1.5 shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10">
        <p className="text-xs font-medium text-blue-700 mb-2">Guide · India</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
        <p className="text-sm text-slate-500 mt-3 leading-relaxed">{description}</p>
        <div className="mt-8 space-y-5 text-[15px] text-slate-600 leading-relaxed">{children}</div>

        <div className="mt-10 p-5 rounded-xl border border-blue-200 bg-blue-50/50">
          <p className="text-sm font-semibold text-slate-900">
            Try it free — {FREE.lead_limit} leads, no card
          </p>
          <p className="text-sm text-slate-600 mt-1">
            {TRIAL_DAYS}-day window. Rank your Sheet or CSV, then call / WhatsApp from the top.
          </p>
          <Link
            to="/signup"
            className="mt-4 inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700"
          >
            Start free trial
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <nav className="mt-10 pt-5 border-t border-slate-200" aria-label="More guides">
          <p className="text-xs font-medium text-slate-500 mb-3">More guides</p>
          <ul className="space-y-2">
            {GUIDE_LINKS.map((g) => (
              <li key={g.to}>
                <Link to={g.to} className="text-sm text-blue-800 hover:underline">
                  {g.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <footer className="mt-10 pt-5 border-t border-slate-200 flex flex-wrap gap-x-5 gap-y-2">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="text-xs text-slate-500 hover:text-slate-800">
              {link.label}
            </Link>
          ))}
          <span className="text-xs text-slate-400">{COMPANY.tradeName} · India</span>
        </footer>
      </main>
    </div>
  );
}

export const GUIDE_LINKS = [
  {
    to: '/guides/whatsapp-lead-list-india',
    label: 'WhatsApp lead list for Indian businesses',
  },
  {
    to: '/guides/rank-leads-google-sheet',
    label: 'Rank leads from a Google Sheet',
  },
  {
    to: '/guides/call-list-from-excel-india',
    label: 'Build a call list from Excel (India)',
  },
] as const;

export function WhatsAppLeadListGuidePage() {
  return (
    <GuideLayout
      title="WhatsApp lead list for Indian businesses"
      description="How small Indian teams turn a messy lead sheet into a daily WhatsApp + call order — without moving into a full CRM."
    >
      <p>
        Most Indian D2C and local-service teams do not live in a CRM. Leads arrive from Facebook,
        Instagram, Google, referrals, and walk-ins, then sit in a Google Sheet or Excel file. Sales
        happens on WhatsApp and phone calls.
      </p>
      <p>
        The daily problem is simple: <strong className="font-semibold text-slate-800">who should
        get the next WhatsApp?</strong> Working top-to-bottom wastes time on cold rows while warm
        leads go quiet.
      </p>
      <h2 className="text-base font-bold text-slate-900 pt-2">A practical workflow</h2>
      <ol className="list-decimal pl-5 space-y-2">
        <li>Keep (or paste) leads in a Sheet with phone, source, date, and outcome when you know it.</li>
        <li>Rank the open rows using your own past conversions — not a generic “AI score.”</li>
        <li>Open WhatsApp or dial from the top of today&apos;s list; mark called, no answer, or snooze.</li>
      </ol>
      <p>
        {COMPANY.tradeName} is built for that loop. It is <em className="not-italic font-medium">not</em>{' '}
        a CRM with pipelines and email campaigns — on purpose.
      </p>
      <h2 className="text-base font-bold text-slate-900 pt-2">WhatsApp templates that match how you sell</h2>
      <p>
        From today&apos;s list, pick Follow-up, Missed call, or Soft nudge — in English, Hindi, or
        Malayalam — then open WhatsApp with the message already filled. Mark called, no answer,
        tomorrow, or converted so your next ranking gets smarter.
      </p>
      <p>
        After outreach, use <strong className="font-semibold text-slate-800">Copy Sheet update</strong> to
        paste phone + status back into Google Sheets. That closes the loop without becoming a system
        of record.
      </p>
    </GuideLayout>
  );
}

export function RankLeadsGoogleSheetGuidePage() {
  return (
    <GuideLayout
      title="Rank leads from a Google Sheet"
      description="Keep working in the Sheet you already use. Connect it once, sync when you need a fresh call order."
    >
      <p>
        If your leads already live in Google Sheets, you should not have to migrate into a new
        database just to know who to call. Share the Sheet as “Anyone with the link can view,”
        connect it in {COMPANY.tradeName}, map columns once, and sync.
      </p>
      <h2 className="text-base font-bold text-slate-900 pt-2">Why Sheet-first wins for SMBs</h2>
      <ul className="list-disc pl-5 space-y-2">
        <li>No CRM setup tax — your team already knows the file.</li>
        <li>New WhatsApp enquiries can be pasted into the Sheet the same day.</li>
        <li>After calls, copy status updates back into the Sheet so the next ranking gets smarter.</li>
      </ul>
      <p>
        Live sync reads your Sheet; outcome paste-back closes the loop without turning {COMPANY.tradeName}{' '}
        into a system of record.
      </p>
    </GuideLayout>
  );
}

export function CallListFromExcelGuidePage() {
  return (
    <GuideLayout
      title="Build a call list from Excel (India)"
      description="Turn an Excel or CSV export into a prioritized call list for Indian sales teams — INR pricing, WhatsApp-ready."
    >
      <p>
        Excel exports from ads managers, WhatsApp Business, or old CRMs are usually messy: mixed
        date formats, missing cities, duplicate phones. That is fine. Map columns once, then get a
        ranked list you can dial and message from.
      </p>
      <h2 className="text-base font-bold text-slate-900 pt-2">What to include in the file</h2>
      <ul className="list-disc pl-5 space-y-2">
        <li>Name and phone (10-digit Indian numbers work; we add +91 for WhatsApp).</li>
        <li>Source (Facebook, Instagram, Google, referral, walk-in…).</li>
        <li>Created / last contacted dates when you have them.</li>
        <li>Outcomes: converted, not converted, no response — the ranking gets better with these.</li>
      </ul>
      <p>
        Upload the file, work today&apos;s top leads first, and export or copy statuses back when you
        want the Sheet to stay the source of truth.
      </p>
    </GuideLayout>
  );
}

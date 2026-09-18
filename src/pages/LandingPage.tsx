import { Link } from 'react-router-dom';
import {
  ArrowRight,
  FileUp,
  ListOrdered,
  PhoneCall,
  TrendingUp,
} from 'lucide-react';
import { COMPANY, LEGAL_LINKS, formattedAddress } from '@/lib/company';
import { TRIAL_DAYS } from '@/lib/trial';
import { getPlan, PLANS, type PlanInfo } from '@/types';

const POPULAR_PLAN_ID = 'growth';
const FREE_PLAN = getPlan('free');
const TRUST_LINES = [
  `${TRIAL_DAYS}-day free trial`,
  'No card required',
  'Prices in ₹',
  `${COMPANY.refundWindowDays}-day refund window`,
] as const;

function formatPrice(plan: PlanInfo): string {
  if (plan.price === 0) return 'Free';
  return `₹${plan.price.toLocaleString('en-IN')}`;
}

function planDurationLabel(plan: PlanInfo): string {
  if (plan.id === 'free') return `${TRIAL_DAYS}-day trial`;
  return 'per month';
}

type MockTone = 'hot' | 'warm' | 'cool';

function scoreToneClass(tone: MockTone): string {
  switch (tone) {
    case 'hot':
      return 'text-amber-300';
    case 'warm':
      return 'text-teal-200';
    case 'cool':
      return 'text-slate-400';
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

/**
 * Stylised call-list strip for the hero.
 * Placeholders only — never real customer names, phones, or businesses.
 */
function HeroLeadMockup() {
  const rows: { label: string; phone: string; source: string; score: number; tone: MockTone }[] = [
    { label: 'Lead A', phone: '9xxxxxxx12', source: 'Instagram', score: 88, tone: 'hot' },
    { label: 'Lead B', phone: '8xxxxxxx45', source: 'Referral', score: 81, tone: 'hot' },
    { label: 'Lead C', phone: '7xxxxxxx88', source: 'Facebook', score: 62, tone: 'warm' },
    { label: 'Lead D', phone: '9xxxxxxx01', source: 'Walk-in', score: 45, tone: 'cool' },
    { label: 'Lead E', phone: '6xxxxxxx33', source: 'Google', score: 22, tone: 'cool' },
  ];

  return (
    <div className="landing-mockup" aria-hidden="true">
      <div className="landing-mockup-inner">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-white/10">
          <span className="text-[11px] sm:text-xs font-medium text-teal-100/90 tracking-wide">
            Today&apos;s call list
          </span>
          <span className="text-[10px] sm:text-[11px] text-teal-200/60">
            Better call order · demo data
          </span>
        </div>
        <div className="flex items-center gap-3 px-4 sm:px-5 pt-2.5 pb-1">
          <span className="w-5" />
          <span className="min-w-0 flex-1 text-[10px] uppercase tracking-wider text-teal-200/40">
            Lead
          </span>
          <span className="text-[10px] uppercase tracking-wider text-teal-200/40">
            Priority
          </span>
        </div>
        <ul className="divide-y divide-white/5">
          {rows.map((row, index) => (
            <li
              key={row.label}
              className="landing-mockup-row flex items-center gap-3 px-4 sm:px-5 py-3"
              style={{ animationDelay: `${180 + index * 70}ms` }}
            >
              <span className="w-5 text-[11px] tabular-nums text-teal-200/50">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{row.label}</p>
                <p className="text-[11px] text-teal-100/50 truncate">
                  {row.phone} · {row.source}
                </p>
              </div>
              <span className={`text-xs font-semibold tabular-nums ${scoreToneClass(row.tone)}`}>
                {row.score}
              </span>
            </li>
          ))}
        </ul>
        <p className="px-4 sm:px-5 py-2.5 border-t border-white/10 text-[10px] sm:text-[11px] text-teal-200/45 leading-snug">
          Priority score — based on this business&apos;s own lead history, not a prediction
        </p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="landing min-h-screen text-slate-900">
      <header className="absolute top-0 inset-x-0 z-20">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-800 text-white flex items-center justify-center">
              <TrendingUp className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="font-display text-lg text-white tracking-tight">
              {COMPANY.tradeName}
            </span>
          </div>
          <nav className="flex items-center gap-5">
            <a
              href="#pricing"
              className="hidden sm:inline text-sm text-teal-50/80 hover:text-white transition-colors"
            >
              Pricing
            </a>
            <Link
              to="/login"
              className="text-sm text-teal-50/80 hover:text-white transition-colors"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {/* 1. Hero */}
      <section className="landing-hero relative overflow-hidden">
        <div className="absolute inset-0 landing-hero-bg" />
        <div className="relative max-w-6xl mx-auto px-5 pt-28 pb-16 sm:pt-32 sm:pb-24">
          <div className="max-w-xl landing-fade-up">
            <p className="font-display text-4xl sm:text-5xl md:text-6xl text-white tracking-tight leading-[1.05] mb-3">
              {COMPANY.tradeName}
            </p>
            <h1 className="text-xl sm:text-2xl text-teal-50/95 font-medium leading-snug mb-4">
              Stop guessing who to call first.
            </h1>
            <p className="text-sm sm:text-base text-teal-100/75 leading-relaxed max-w-md mb-8">
              Prioritizes today&apos;s leads using your own past patterns — a better call order,
              built from your own history. Upload a CSV, then work the top of the list first.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/signup" className="landing-cta-primary inline-flex items-center gap-2">
                Start free trial
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <a href="#how-it-works" className="landing-cta-ghost">
                See how it works
              </a>
            </div>
            <p className="mt-5 text-[12px] sm:text-[13px] text-teal-100/55 tracking-wide">
              {TRUST_LINES.join(' · ')}
            </p>
          </div>

          <div className="mt-12 sm:mt-16 landing-fade-up landing-fade-up-delay">
            <HeroLeadMockup />
          </div>
        </div>
      </section>

      {/* 2. Problem */}
      <section className="landing-section border-b border-slate-200/80">
        <div className="max-w-3xl mx-auto px-5">
          <h2 className="font-display text-2xl sm:text-3xl text-slate-900 tracking-tight mb-5">
            Leads pour in. Call order doesn&apos;t.
          </h2>
          <div className="space-y-3 text-slate-600 text-[15px] sm:text-base leading-relaxed">
            <p>
              Facebook, Instagram, Google, referrals, walk-ins — they all land in different places,
              then get dumped into one unsorted sheet.
            </p>
            <p>
              Your sales team calls by gut feel, or works top-to-bottom through yesterday&apos;s
              mess, while a warm lead goes cold waiting their turn.
            </p>
            <p>
              The problem isn&apos;t effort. It&apos;s not knowing who deserves the next call.
            </p>
          </div>
        </div>
      </section>

      {/* 3. How it works */}
      <section id="how-it-works" className="landing-section bg-white border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="font-display text-2xl sm:text-3xl text-slate-900 tracking-tight mb-10">
            How it works
          </h2>
          <ol className="grid sm:grid-cols-3 gap-8 sm:gap-6">
            {[
              {
                icon: FileUp,
                title: 'Upload your CSV',
                detail: 'Drop in the export you already keep — Excel works too.',
              },
              {
                icon: ListOrdered,
                title: 'Get a ranked list',
                detail: 'Each row is ordered from patterns in your own history.',
              },
              {
                icon: PhoneCall,
                title: 'Call the top first',
                detail: 'Work down the list — WhatsApp and dial from the row.',
              },
            ].map((step, index) => (
              <li key={step.title} className="flex sm:flex-col gap-4">
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-display text-3xl text-teal-800/25 tabular-nums w-8">
                    {index + 1}
                  </span>
                  <step.icon className="w-5 h-5 text-teal-800 sm:hidden" aria-hidden="true" />
                </div>
                <div>
                  <step.icon
                    className="w-5 h-5 text-teal-800 mb-3 hidden sm:block"
                    aria-hidden="true"
                  />
                  <h3 className="text-base font-semibold text-slate-900 mb-1">{step.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 3b. Straight talk — trust without fake social proof */}
      <section className="landing-section border-b border-slate-200/80 bg-[#f7faf9]">
        <div className="max-w-3xl mx-auto px-5">
          <h2 className="font-display text-2xl sm:text-3xl text-slate-900 tracking-tight mb-5">
            Straight with you
          </h2>
          <p className="text-[15px] sm:text-base text-slate-600 leading-relaxed mb-8">
            {COMPANY.tradeName} reorders who you call next using patterns in{' '}
            <em className="not-italic font-medium text-slate-800">your</em> past leads. It does
            not invent buyers, scrape the internet for scores, or promise a conversion rate.
          </p>
          <ul className="space-y-5 text-[15px] text-slate-600 leading-relaxed">
            <li className="pl-4 border-l-2 border-teal-700/40">
              <span className="block font-semibold text-slate-900 mb-1">Your history, your order</span>
              Source, timing, recency, and past outcomes from the file you upload — nothing else.
            </li>
            <li className="pl-4 border-l-2 border-teal-700/40">
              <span className="block font-semibold text-slate-900 mb-1">Your customer data stays yours</span>
              Leads are uploaded so we can score them for your workspace. We don&apos;t sell them.
              Read how we handle data in our{' '}
              <Link to="/privacy" className="text-teal-800 font-medium underline-offset-2 hover:underline">
                Privacy Policy
              </Link>
              .
            </li>
            <li className="pl-4 border-l-2 border-teal-700/40">
              <span className="block font-semibold text-slate-900 mb-1">A real business you can reach</span>
              Run by {COMPANY.legalName} in {COMPANY.address.city}, {COMPANY.address.state}. Support
              replies within about {COMPANY.supportResponseDays} working days —{' '}
              <a
                href={`mailto:${COMPANY.supportEmail}`}
                className="text-teal-800 font-medium underline-offset-2 hover:underline"
              >
                {COMPANY.supportEmail}
              </a>
              {' · '}
              <a
                href={`tel:${COMPANY.supportPhone.replace(/\s/g, '')}`}
                className="text-teal-800 font-medium underline-offset-2 hover:underline"
              >
                {COMPANY.supportPhone}
              </a>
              .
            </li>
          </ul>
        </div>
      </section>

      {/* 4. Pricing — PLANS is the only source of prices and limits */}
      <section id="pricing" className="landing-section border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="font-display text-2xl sm:text-3xl text-slate-900 tracking-tight mb-2">
            Simple pricing
          </h2>
          <p className="text-sm text-slate-500 mb-10 max-w-lg">
            Start on the free trial — no card. Upgrade when monthly volume needs it. Limits are
            enforced in the database, not just on the screen. Unused paid plans can be refunded
            within {COMPANY.refundWindowDays} days (
            <Link to="/refunds" className="text-teal-800 underline-offset-2 hover:underline">
              Refund Policy
            </Link>
            ).
          </p>

          {PLANS.length === 0 ? (
            <p className="text-sm text-slate-500">
              Plans are temporarily unavailable. Email {COMPANY.supportEmail} and we&apos;ll help.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {PLANS.map((plan) => {
                const popular = plan.id === POPULAR_PLAN_ID;
                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-xl border p-5 ${
                      popular
                        ? 'border-teal-700 bg-teal-50/40'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    {popular && (
                      <span className="absolute -top-2.5 left-4 text-[10px] font-bold tracking-wider text-teal-900 bg-teal-100 border border-teal-200 px-2 py-0.5 rounded">
                        POPULAR
                      </span>
                    )}
                    <h3 className="text-sm font-semibold text-slate-900">{plan.name}</h3>
                    <p className="mt-3 font-display text-3xl text-slate-900 tracking-tight">
                      {formatPrice(plan)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{planDurationLabel(plan)}</p>
                    <p className="text-sm text-slate-700 mt-4 tabular-nums">
                      {plan.lead_limit.toLocaleString('en-IN')} leads / month
                    </p>
                    <ul className="mt-4 space-y-1.5 flex-1">
                      {plan.features.map((feature) => (
                        <li key={feature} className="text-xs text-slate-500">
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Link
                      to="/signup"
                      className={`mt-6 text-center text-sm font-medium py-2.5 rounded-lg transition-colors ${
                        popular
                          ? 'bg-teal-800 text-white hover:bg-teal-900'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {plan.id === 'free' ? 'Start free trial' : 'Get started'}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 5. FAQ — honest limits */}
      <section className="landing-section bg-white border-b border-slate-200/80">
        <div className="max-w-3xl mx-auto px-5">
          <h2 className="font-display text-2xl sm:text-3xl text-slate-900 tracking-tight mb-8">
            Questions worth asking
          </h2>
          <dl className="space-y-8">
            <div>
              <dt className="text-base font-semibold text-slate-900 mb-2">
                Does this predict who will buy?
              </dt>
              <dd className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                No. It improves your call order based on patterns in your own past leads — source,
                timing, recency, and what converted before. It is not a guarantee that someone will
                buy, and it is not magic. The ranking gets more useful the more settled history you
                upload (won / lost / no response). Think better prioritisation, not prophecy.
              </dd>
            </div>
            <div>
              <dt className="text-base font-semibold text-slate-900 mb-2">
                What do I need to upload?
              </dt>
              <dd className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                A CSV or Excel export of your leads with names, phones, sources, dates, and
                outcomes where you have them. Messy CRM exports are fine — you map the columns
                once before scoring.
              </dd>
            </div>
            <div>
              <dt className="text-base font-semibold text-slate-900 mb-2">
                What happens to my customer data?
              </dt>
              <dd className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                Your upload is used to score and show leads inside your workspace. We don&apos;t
                sell lead lists or use your customers for unrelated marketing. Details are in the{' '}
                <Link to="/privacy" className="text-teal-800 font-medium underline-offset-2 hover:underline">
                  Privacy Policy
                </Link>
                . For a data request, email {COMPANY.supportEmail}.
              </dd>
            </div>
            <div>
              <dt className="text-base font-semibold text-slate-900 mb-2">Who is this for?</dt>
              <dd className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                Small Indian businesses — local services and D2C brands — whose leads arrive from
                Facebook, Instagram, Google, referrals, and walk-ins, and whose sales run on calls
                and WhatsApp rather than a heavy CRM.
              </dd>
            </div>
            <div>
              <dt className="text-base font-semibold text-slate-900 mb-2">
                Is the free trial really free?
              </dt>
              <dd className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                Yes. {TRIAL_DAYS} days, {FREE_PLAN.lead_limit.toLocaleString('en-IN')} leads, no
                card required. When the trial ends or you hit the limit, you upgrade to keep
                uploading. Your existing scored leads stay readable. Paid plans follow our{' '}
                <Link to="/refunds" className="text-teal-800 font-medium underline-offset-2 hover:underline">
                  Refund Policy
                </Link>{' '}
                ({COMPANY.refundWindowDays} days on unused plans).
              </dd>
            </div>
          </dl>

          <div className="mt-12 pt-8 border-t border-slate-100">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 bg-teal-800 text-white font-semibold px-5 py-3 rounded-lg text-sm hover:bg-teal-900 transition-colors"
            >
              Start free trial
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* 6. Footer */}
      <footer className="bg-slate-900 text-slate-400">
        <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-8">
          <div>
            <p className="font-display text-lg text-white tracking-tight">{COMPANY.tradeName}</p>
            <p className="text-xs text-slate-500 mt-2 max-w-sm leading-relaxed">
              A better call order, built from your own lead history — for small businesses in
              India.
            </p>
            <p className="text-[11px] text-slate-500 mt-4 leading-relaxed max-w-sm">
              {COMPANY.legalName}
              <br />
              {formattedAddress()}
            </p>
            <div className="mt-4 flex flex-col gap-1.5 text-sm">
              <a
                href={`mailto:${COMPANY.supportEmail}`}
                className="text-teal-300/90 hover:text-teal-200 transition-colors"
              >
                {COMPANY.supportEmail}
              </a>
              <a
                href={`tel:${COMPANY.supportPhone.replace(/\s/g, '')}`}
                className="text-teal-300/90 hover:text-teal-200 transition-colors"
              >
                {COMPANY.supportPhone}
              </a>
            </div>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Legal">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

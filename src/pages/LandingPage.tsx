import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  FileUp,
  ListOrdered,
  PhoneCall,
  Shield,
  UserRound,
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { playLandingMotion } from '@/lib/animeMotion';
import { COMPANY, LEGAL_LINKS, formattedAddress } from '@/lib/company';
import { GUIDE_LINKS } from '@/pages/Guides';
import { TRIAL_DAYS } from '@/lib/trial';
import { getPlan, PLANS, type PlanInfo, type PlanType } from '@/types';

const POPULAR_PLAN_ID = 'growth';
const FREE_PLAN = getPlan('free');
const TRUST_LINES = [
  `${FREE_PLAN.lead_limit} leads to judge the list`,
  'No card required',
  'Prices in ₹',
  `${COMPANY.refundWindowDays}-day refund window`,
] as const;

/** Shared across every tier — shown once above the pricing grid. */
const SHARED_PLAN_INCLUDES =
  'Every plan includes an AI-ranked call list you can dial or WhatsApp from.';

/** Per-tier diffs only (lead volume is shown separately on each card). */
const PLAN_DIFF_FEATURES: Record<PlanType, string[]> = {
  free: ['CSV export'],
  starter: ['Priority filters', 'CSV export'],
  growth: ['Advanced filters', 'CSV export'],
  pro: ['All filters', 'Priority support'],
};

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
      return 'text-blue-200';
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
      <div className="landing-mockup-inner" data-motion="float">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-white/10">
          <span className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-medium text-blue-100/90 tracking-wide">
            <span className="relative inline-flex h-2 w-2" aria-hidden="true">
              <span
                data-motion="live-ping"
                className="absolute inset-0 rounded-full bg-emerald-400/80"
              />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Today&apos;s call list
          </span>
          <span className="hidden sm:inline text-[10px] sm:text-[11px] text-blue-200/60">
            Better call order · demo data
          </span>
        </div>
        <div className="flex items-center gap-3 px-4 sm:px-5 pt-2.5 pb-1">
          <span className="w-5" />
          <span className="min-w-0 flex-1 text-[10px] uppercase tracking-wider text-blue-200/40">
            Lead
          </span>
          <span className="text-[10px] uppercase tracking-wider text-blue-200/40">
            Priority
          </span>
        </div>
        <ul className="divide-y divide-white/5" data-motion="call-list">
          {rows.map((row, index) => (
            <li
              key={row.label}
              data-motion-item
              className="landing-motion-item flex items-center gap-3 px-4 sm:px-5 py-3"
            >
              <span className="w-5 text-[11px] tabular-nums text-blue-200/50">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{row.label}</p>
                <p className="text-[11px] text-blue-100/50 truncate">
                  {row.phone} · {row.source}
                </p>
              </div>
              <span
                data-call-hint
                className="hidden sm:inline text-[10px] font-medium text-amber-200/90 whitespace-nowrap opacity-0"
              >
                Call next
              </span>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span
                  data-score={row.score}
                  className={`text-xs font-semibold tabular-nums ${scoreToneClass(row.tone)}`}
                >
                  {row.score}
                </span>
                <span className="landing-score-track" aria-hidden="true">
                  <span
                    data-score-bar={row.score}
                    data-tone={row.tone}
                    className="landing-score-fill"
                  />
                </span>
              </div>
            </li>
          ))}
        </ul>
        <p className="px-4 sm:px-5 py-2.5 border-t border-white/10 text-[10px] sm:text-[11px] text-blue-200/45 leading-snug">
          Ranked from this business&apos;s past leads — a clearer call order, not a sales guarantee
        </p>
      </div>
    </div>
  );
}

function TrialCta({
  className,
  children = `Start free ${TRIAL_DAYS}-day trial`,
  cta,
}: {
  className: string;
  children?: string;
  cta?: 'hero' | 'sticky' | 'mid';
}) {
  return (
    <Link to="/signup" className={className} {...(cta ? { 'data-cta': cta } : {})}>
      {children}
      <ArrowRight className="w-4 h-4" aria-hidden="true" />
    </Link>
  );
}

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    try {
      return playLandingMotion(root);
    } catch {
      root.querySelectorAll<HTMLElement>('.landing-motion-item').forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      return undefined;
    }
  }, []);

  return (
    <div ref={rootRef} className="landing min-h-screen text-slate-900">
      <div className="landing-scroll-progress" aria-hidden="true">
        <span data-motion="scroll-progress" className="landing-scroll-progress-bar" />
      </div>
      <header className="absolute top-0 inset-x-0 z-20">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-3">
          <a href="#top" className="shrink-0" aria-label="LeadScore home">
            <BrandLogo variant="onDark" size={32} />
          </a>
          <nav className="flex items-center gap-3 sm:gap-6 shrink-0" aria-label="Primary">
            <a
              href="#top"
              className="hidden sm:inline text-sm font-medium text-white/90 hover:text-white transition-colors"
            >
              Home
            </a>
            <a
              href="#how-it-works"
              className="hidden sm:inline text-sm font-medium text-white/90 hover:text-white transition-colors"
            >
              Features
            </a>
            <a
              href="#product"
              className="hidden md:inline text-sm font-medium text-white/90 hover:text-white transition-colors"
            >
              Product
            </a>
            <a
              href="#pricing"
              className="text-sm font-medium text-white/90 hover:text-white transition-colors"
            >
              Pricing
            </a>
            <Link
              to="/login"
              data-cta="signin"
              className="landing-signin inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-white border border-white/25 bg-white/5"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {/* 1. Hero — message-led hierarchy; split on desktop */}
      <section id="top" className="landing-hero relative overflow-hidden">
        <div className="absolute inset-0 landing-hero-bg" />
        <div className="relative max-w-6xl mx-auto px-5 pt-24 pb-12 sm:pt-28 sm:pb-16 lg:pt-32 lg:pb-24">
          <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-10 lg:items-center">
            <div data-motion="hero" className="max-w-xl lg:max-w-none">
              <p
                data-motion-item
                className="landing-motion-item font-display text-3xl sm:text-4xl tracking-tight leading-none mb-4"
              >
                <span className="text-white">Lead</span>
                <span className="text-blue-400">Score</span>
              </p>
              <h1
                data-motion-item
                className="landing-motion-item text-3xl sm:text-4xl text-white font-semibold tracking-tight leading-[1.15] mb-3"
              >
                Stop guessing who to call first.
              </h1>
              <p
                data-motion-item
                className="landing-motion-item text-sm text-blue-200/80 mb-3 max-w-md leading-snug"
              >
                For Indian businesses that sell on WhatsApp and calls — not another CRM. Rank the
                Google Sheet or CSV you already keep.
              </p>
              <p
                data-motion-item
                className="landing-motion-item text-sm sm:text-base text-blue-100/75 leading-relaxed max-w-md mb-8"
              >
                Upload your leads, get a call order ranked by what&apos;s actually worked for your
                business before. Most people see a useful list on the first upload —{' '}
                {FREE_PLAN.lead_limit} real leads is enough to judge, not {TRIAL_DAYS} days of waiting.
              </p>
              <div data-motion-item className="landing-motion-item flex flex-wrap items-center gap-3">
                <TrialCta cta="hero" className="landing-cta-primary inline-flex items-center gap-2" />
                <a href="#how-it-works" className="landing-cta-ghost">
                  See how it works
                </a>
              </div>
              <ul
                data-motion-item
                className="landing-motion-item mt-5 flex flex-wrap gap-2"
                aria-label="Trial terms"
              >
                {TRUST_LINES.map((line) => (
                  <li key={line} className="landing-trust-chip">
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div data-motion="hero-panel" className="mt-10 lg:mt-0">
              <div data-motion-item className="landing-motion-item">
                <HeroLeadMockup />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Problem */}
      <section className="landing-section border-b border-slate-200/80">
        <div className="max-w-3xl mx-auto px-5" data-motion="reveal">
          <h2
            data-motion-item
            className="landing-motion-item font-display text-2xl sm:text-3xl text-slate-900 tracking-tight mb-5"
          >
            Leads pour in. Call order doesn&apos;t.
          </h2>
          <div
            data-motion-item
            className="landing-motion-item space-y-3 text-slate-600 text-[15px] sm:text-base leading-relaxed"
          >
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

      {/* 3. Who this is for */}
      <section className="landing-section border-b border-slate-200/80 bg-white">
        <div className="max-w-3xl mx-auto px-5" data-motion="reveal">
          <h2
            data-motion-item
            className="landing-motion-item font-display text-2xl sm:text-3xl text-slate-900 tracking-tight mb-5"
          >
            Built for how you already sell
          </h2>
          <ul
            data-motion-item
            className="landing-motion-item space-y-3 text-[15px] sm:text-base text-slate-600 leading-relaxed"
          >
            <li className="flex gap-3">
              <span className="text-blue-600 font-semibold shrink-0" aria-hidden="true">
                ·
              </span>
              <span>
                Leads from Facebook, Instagram, Google, referrals, and walk-ins — not a polished
                inbound CRM funnel.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-blue-600 font-semibold shrink-0" aria-hidden="true">
                ·
              </span>
              <span>Sales by call and WhatsApp, not a heavy pipeline tool.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-blue-600 font-semibold shrink-0" aria-hidden="true">
                ·
              </span>
              <span>You already keep leads in a sheet, Excel export, or Google Sheet.</span>
            </li>
          </ul>
          <p
            data-motion-item
            className="landing-motion-item mt-6 text-sm text-slate-500 leading-relaxed"
          >
            If that&apos;s your world, LeadScore fits. If you need a full CRM, this isn&apos;t it —
            and that&apos;s intentional.
          </p>
        </div>
      </section>

      {/* 4. How it works */}
      <section id="how-it-works" className="landing-section bg-[#E8F1FF] border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-5" data-motion="reveal">
          <h2
            data-motion-item
            className="landing-motion-item font-display text-2xl sm:text-3xl text-slate-900 tracking-tight mb-8 lg:mb-10"
          >
            How it works
          </h2>
          <ol className="grid sm:grid-cols-3 gap-8 sm:gap-6">
            {[
              {
                icon: FileUp,
                title: 'Bring your leads in',
                detail:
                  'Upload a CSV or Excel export — or connect a Google Sheet and it stays in sync automatically.',
              },
              {
                icon: ListOrdered,
                title: 'Get a ranked list',
                detail:
                  'Each row is ordered from what converted before in your data — so you know who to call first.',
              },
              {
                icon: PhoneCall,
                title: 'Call and WhatsApp the top',
                detail:
                  'Work down the list. Dial or message from the row; mark called, missed, or snooze for tomorrow.',
              },
            ].map((step, index) => (
              <li key={step.title} data-motion-item className="landing-motion-item flex sm:flex-col gap-4">
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-display text-3xl text-blue-600/25 tabular-nums w-8">
                    {index + 1}
                  </span>
                  <step.icon className="w-5 h-5 text-blue-600 sm:hidden" aria-hidden="true" />
                </div>
                <div>
                  <step.icon
                    className="w-5 h-5 text-blue-600 mb-3 hidden sm:block"
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

      {/* 5. Product screenshots — real LeadScore UI, not a CRM mock */}
      <section id="product" className="landing-section border-b border-slate-200/80 bg-slate-50">
        <div className="max-w-6xl mx-auto px-5" data-motion="reveal">
          <h2
            data-motion-item
            className="landing-motion-item font-display text-2xl sm:text-3xl text-slate-900 tracking-tight mb-3"
          >
            See the product
          </h2>
          <p
            data-motion-item
            className="landing-motion-item text-[15px] sm:text-base text-slate-600 leading-relaxed max-w-2xl mb-8"
          >
            Ranked list, WhatsApp and call from each row — the dashboard your team opens every
            morning.
          </p>

          <div className="grid sm:grid-cols-2 gap-5 lg:gap-8">
            <figure data-motion-item className="landing-motion-item min-w-0">
              <div className="landing-shot">
                <img
                  src="/screenshots/dashboard.png?v=5"
                  alt="LeadScore overview: scores, sources, and who to call first"
                  width={1024}
                  height={573}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <figcaption className="mt-3 text-sm text-slate-500">
                Overview — scores and who to call first
              </figcaption>
            </figure>
            <figure data-motion-item className="landing-motion-item min-w-0">
              <div className="landing-shot">
                <img
                  src="/screenshots/call-list.png?v=5"
                  alt="Ranked call list with WhatsApp and Call on each lead"
                  width={988}
                  height={1024}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <figcaption className="mt-3 text-sm text-slate-500">
                Call list — WhatsApp or call in one tap
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* 6. Straight with you */}
      <section className="landing-section border-b border-slate-200/80 bg-white">
        <div className="max-w-3xl mx-auto px-5" data-motion="reveal">
          <h2
            data-motion-item
            className="landing-motion-item font-display text-2xl sm:text-3xl text-slate-900 tracking-tight mb-5"
          >
            Straight with you
          </h2>
          <p
            data-motion-item
            className="landing-motion-item text-[15px] sm:text-base text-slate-600 leading-relaxed mb-4"
          >
            LeadScore reorders your call list using patterns already in your data. It&apos;s not
            magic — no invented buyers, no web-scraped scores, no guaranteed conversion rate. Just a
            clearer starting point every morning.
          </p>
          <p
            data-motion-item
            className="landing-motion-item text-[15px] sm:text-base text-slate-600 leading-relaxed mb-8"
          >
            If you want pipelines, deal stages, or email campaigns, this isn&apos;t that tool —
            deliberately. We solve who to call first today, from the sheet you already use.
          </p>
          <ul className="space-y-5 text-[15px] text-slate-600 leading-relaxed">
            <li data-motion-item className="landing-motion-item flex gap-3">
              <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="block font-semibold text-slate-900 mb-1">
                  Your history decides the order
                </span>
                Source, timing, recency, and past outcomes from the file you upload — nothing else.
              </div>
            </li>
            <li data-motion-item className="landing-motion-item flex gap-3">
              <Shield className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="block font-semibold text-slate-900 mb-1">
                  Your customer data stays yours
                </span>
                Leads are uploaded so we can score them for your workspace. We don&apos;t sell them.
                Read how we handle data in our{' '}
                <Link
                  to="/privacy"
                  className="text-blue-800 font-medium underline-offset-2 hover:underline"
                >
                  Privacy Policy
                </Link>
                .
              </div>
            </li>
            <li data-motion-item className="landing-motion-item flex gap-3">
              <UserRound className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="block font-semibold text-slate-900 mb-1">
                  A real business you can reach
                </span>
                Run by {COMPANY.legalName} in {COMPANY.address.city}, {COMPANY.address.state}. Built
                and supported by one person — so replies come from someone who actually knows how
                the product works. Usually within about {COMPANY.supportResponseDays} working days
                —{' '}
                <a
                  href={`mailto:${COMPANY.supportEmail}`}
                  className="text-blue-800 font-medium underline-offset-2 hover:underline"
                >
                  {COMPANY.supportEmail}
                </a>
                {' · '}
                <a
                  href={`tel:${COMPANY.supportPhone.replace(/\s/g, '')}`}
                  className="text-blue-800 font-medium underline-offset-2 hover:underline"
                >
                  {COMPANY.supportPhone}
                </a>
                .
              </div>
            </li>
          </ul>
        </div>
      </section>

      {/* 7. Mid-page CTA */}
      <section className="border-b border-slate-200/80 bg-[#E8F1FF]">
        <div
          className="max-w-3xl mx-auto px-5 py-10 sm:py-12 lg:py-14 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5"
          data-motion="reveal"
        >
          <div data-motion-item className="landing-motion-item">
            <p className="text-base font-semibold text-slate-900">
              Convinced? Try it free for {TRIAL_DAYS} days — no card.
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Questions first?{' '}
              <a
                href={`mailto:${COMPANY.supportEmail}`}
                className="text-blue-800 font-medium underline-offset-2 hover:underline"
              >
                Email {COMPANY.supportEmail}
              </a>
            </p>
          </div>
          <div data-motion-item className="landing-motion-item w-full sm:w-auto shrink-0">
            <TrialCta
              cta="mid"
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-blue-600 text-white font-semibold px-5 py-3 rounded-lg text-sm hover:bg-blue-700 transition-colors"
            />
          </div>
        </div>
      </section>

      {/* 8. Pricing */}
      <section id="pricing" className="landing-section border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-5" data-motion="reveal">
          <div data-motion-item className="landing-motion-item">
            <h2 className="font-display text-2xl sm:text-3xl text-slate-900 tracking-tight mb-2">
              Simple pricing
            </h2>
            <p className="text-sm text-slate-500 mb-3 max-w-lg">
              Start free — no card. You get {FREE_PLAN.lead_limit.toLocaleString('en-IN')} leads to see
              your ranked list in one sitting ({TRIAL_DAYS}-day window). Upgrade when monthly volume
              needs it. Unused paid plans can be refunded within {COMPANY.refundWindowDays} days (
              <Link to="/refunds" className="text-blue-800 underline-offset-2 hover:underline">
                Refund Policy
              </Link>
              ).
            </p>
            <p className="text-sm text-slate-500 mb-4 max-w-lg">
              Not sure how many leads you get a month? Most solo operators start on Starter — you can
              upgrade anytime.
            </p>
            <p className="text-sm font-medium text-slate-700 mb-8 max-w-xl">{SHARED_PLAN_INCLUDES}</p>
          </div>

          {PLANS.length === 0 ? (
            <p className="text-sm text-slate-500">
              Plans are temporarily unavailable. Email {COMPANY.supportEmail} and we&apos;ll help.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {PLANS.map((plan) => {
                const popular = plan.id === POPULAR_PLAN_ID;
                const diffs = PLAN_DIFF_FEATURES[plan.id];
                return (
                  <div
                    key={plan.id}
                    data-motion-item
                    className={`landing-motion-item relative flex flex-col rounded-xl border p-5 ${
                      popular
                        ? 'border-blue-700 bg-blue-50/40'
                        : 'border-slate-200 bg-white'
                    }`}
                    {...(popular ? { 'data-plan': 'recommended' } : {})}
                  >
                    {popular && (
                      <span className="absolute -top-2.5 left-4 text-[10px] font-bold tracking-wide text-blue-900 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded">
                        Recommended
                      </span>
                    )}
                    <h3 className={`text-sm font-semibold text-slate-900 ${popular ? 'mt-1' : ''}`}>
                      {plan.name}
                    </h3>
                    {popular && (
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                        Best when lead volume is growing past a solo list.
                      </p>
                    )}
                    <p className="mt-3 font-display text-3xl text-slate-900 tracking-tight">
                      {formatPrice(plan)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{planDurationLabel(plan)}</p>
                    <p className="text-sm text-slate-700 mt-4 tabular-nums font-medium">
                      {plan.lead_limit.toLocaleString('en-IN')} leads / month
                    </p>
                    <ul className="mt-4 space-y-1.5 flex-1">
                      {diffs.map((feature) => (
                        <li key={feature} className="text-xs text-slate-500">
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Link
                      to="/signup"
                      className={`mt-6 text-center text-sm font-medium py-2.5 rounded-lg transition-colors ${
                        popular
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {plan.id === 'free'
                        ? `Start free ${TRIAL_DAYS}-day trial`
                        : 'Start free trial'}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 9. FAQ */}
      <section className="landing-section bg-white border-b border-slate-200/80">
        <div className="max-w-3xl mx-auto px-5" data-motion="reveal">
          <h2
            data-motion-item
            className="landing-motion-item font-display text-2xl sm:text-3xl text-slate-900 tracking-tight mb-8"
          >
            Questions worth asking
          </h2>
          <dl className="space-y-8">
            <div data-motion-item className="landing-motion-item">
              <dt className="text-base font-semibold text-slate-900 mb-2">
                Does this predict who will buy?
              </dt>
              <dd className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                No. It improves your call order based on patterns in your past leads — source,
                timing, recency, and what converted before. It is not a guarantee that someone will
                buy. The ranking gets more useful the more settled history you upload (converted /
                not converted / no response). Think better prioritisation, not prophecy.
              </dd>
            </div>
            <div data-motion-item className="landing-motion-item">
              <dt className="text-base font-semibold text-slate-900 mb-2">Is this a CRM?</dt>
              <dd className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                No. LeadScore doesn&apos;t replace your CRM or store a full sales pipeline — it
                tells you which leads to call first, based on your data. Keep working from your
                sheet or export; use LeadScore for today&apos;s order. If you want pipelines, deal
                stages, or email campaigns, choose a CRM instead — we&apos;re the ranking layer for
                the sheet you already keep.
              </dd>
            </div>
            <div data-motion-item className="landing-motion-item">
              <dt className="text-base font-semibold text-slate-900 mb-2">
                Why only {TRIAL_DAYS} days — not a longer trial?
              </dt>
              <dd className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                You don&apos;t need a month to know if a ranked list is useful. Most people see it
                on the first upload. {FREE_PLAN.lead_limit.toLocaleString('en-IN')} real leads in{' '}
                {TRIAL_DAYS} days is enough to judge. Need more time? Email{' '}
                {COMPANY.supportEmail} — we&apos;re a person, not a queue.
              </dd>
            </div>
            <div data-motion-item className="landing-motion-item">
              <dt className="text-base font-semibold text-slate-900 mb-2">
                What do I need to upload?
              </dt>
              <dd className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                A CSV or Excel export of your leads with names, phones, sources, dates, and
                outcomes where you have them — or connect a Google Sheet. Messy exports are fine;
                you map the columns once before scoring.
              </dd>
            </div>
            <div data-motion-item className="landing-motion-item">
              <dt className="text-base font-semibold text-slate-900 mb-2">
                What happens to my customer data?
              </dt>
              <dd className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                Your upload is used to score and show leads inside your workspace. We don&apos;t
                sell lead lists or use your customers for unrelated marketing. Details are in the{' '}
                <Link
                  to="/privacy"
                  className="text-blue-800 font-medium underline-offset-2 hover:underline"
                >
                  Privacy Policy
                </Link>
                . For a data request, email {COMPANY.supportEmail}.
              </dd>
            </div>
            <div data-motion-item className="landing-motion-item">
              <dt className="text-base font-semibold text-slate-900 mb-2">Who is this for?</dt>
              <dd className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                Small Indian businesses — local services and D2C brands — whose leads arrive from
                Facebook, Instagram, Google, referrals, and walk-ins, and whose sales run on calls
                and WhatsApp rather than a heavy CRM.
              </dd>
            </div>
            <div data-motion-item className="landing-motion-item">
              <dt className="text-base font-semibold text-slate-900 mb-2">
                Is the free trial really free?
              </dt>
              <dd className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                Yes. {TRIAL_DAYS} days, {FREE_PLAN.lead_limit.toLocaleString('en-IN')} leads, no
                card required. When the trial ends or you hit the limit, you upgrade to keep
                uploading. Your existing scored leads stay readable. Paid plans follow our{' '}
                <Link
                  to="/refunds"
                  className="text-blue-800 font-medium underline-offset-2 hover:underline"
                >
                  Refund Policy
                </Link>{' '}
                ({COMPANY.refundWindowDays} days on unused plans).
              </dd>
            </div>
            <div data-motion-item className="landing-motion-item">
              <dt className="text-base font-semibold text-slate-900 mb-2">
                Was this called LeadAI before?
              </dt>
              <dd className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                Yes. Formerly LeadAI — same product, same team. Only the name changed.
              </dd>
            </div>
          </dl>

          <div data-motion-item className="landing-motion-item mt-12 pt-8 border-t border-slate-100">
            <TrialCta className="inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-blue-600 text-white font-semibold px-5 py-3 rounded-lg text-sm hover:bg-blue-700 transition-colors" />
          </div>
        </div>
      </section>

      {/* 10. Footer */}
      <footer className="bg-slate-900 text-slate-400">
        <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-8">
          <div>
            <p className="font-display text-lg tracking-tight">
              <span className="text-white">Lead</span>
              <span className="text-blue-400">Score</span>
            </p>
            <p className="text-xs text-slate-500 mt-2 max-w-sm leading-relaxed">
              A better call order from your lead history — for small businesses in India.
            </p>
            <p className="text-[11px] text-slate-500 mt-3 max-w-sm leading-relaxed">
              Formerly {COMPANY.formerTradeName} — same product, same team.
            </p>
            <p className="text-[11px] text-slate-500 mt-4 leading-relaxed max-w-sm">
              {COMPANY.legalName}
              <br />
              {formattedAddress()}
            </p>
            <div className="mt-4 flex flex-col gap-1.5 text-sm">
              <a
                href={`mailto:${COMPANY.supportEmail}`}
                className="text-blue-300 hover:text-blue-200 transition-colors"
              >
                {COMPANY.supportEmail}
              </a>
              <a
                href={`tel:${COMPANY.supportPhone.replace(/\s/g, '')}`}
                className="text-blue-300 hover:text-blue-200 transition-colors"
              >
                {COMPANY.supportPhone}
              </a>
            </div>
          </div>
          <nav className="flex flex-col gap-6" aria-label="Site">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Guides</p>
              <ul className="space-y-2">
                {GUIDE_LINKS.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Legal</p>
              <ul className="flex flex-wrap gap-x-5 gap-y-2">
                {LEGAL_LINKS.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>
      </footer>

      <div
        data-motion="sticky-cta"
        className="landing-sticky-cta"
        role="region"
        aria-label="Start free trial"
      >
        <div className="landing-sticky-cta-inner">
          <p className="min-w-0 text-xs sm:text-sm text-white/90 truncate">
            Free {TRIAL_DAYS}-day trial · {FREE_PLAN.lead_limit} leads · no card
          </p>
          <TrialCta
            cta="sticky"
            className="inline-flex items-center justify-center gap-1.5 bg-white text-slate-900 font-semibold px-3.5 py-2 rounded-md text-xs sm:text-sm shrink-0"
          >
            Start trial
          </TrialCta>
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Mail, MapPin, Phone } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { COMPANY, LEGAL_LINKS, formattedAddress, hasUnconfirmedDetails } from '@/lib/company';
import { PLANS } from '@/types';

const LAST_UPDATED = '17 September 2026';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-sm font-bold text-slate-900 mb-2">{title}</h2>
      <div className="text-sm text-slate-600 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
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
            Back
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        <p className="text-xs text-slate-400 mt-1.5">Last updated {LAST_UPDATED}</p>

        {/* Publishing a placeholder address is worse than looking unfinished,
            so this stays visible until the real details are filled in. */}
        {hasUnconfirmedDetails() && (
          <div className="mt-5 flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              This page is not finished: the business details in{' '}
              <code className="text-xs">src/lib/company.ts</code> still need to be filled in.
            </span>
          </div>
        )}

        {children}

        <LegalFooter />
      </main>
    </div>
  );
}

export function LegalFooter() {
  return (
    <footer className="mt-12 pt-5 border-t border-slate-200 flex flex-wrap gap-x-5 gap-y-2">
      {LEGAL_LINKS.map((link) => (
        <Link key={link.to} to={link.to} className="text-xs text-slate-500 hover:text-slate-800">
          {link.label}
        </Link>
      ))}
    </footer>
  );
}

export function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <Section title="1. Who you are contracting with">
        <p>
          {COMPANY.tradeName} is operated by {COMPANY.legalName}, {formattedAddress()}.
          {COMPANY.gstin ? ` GSTIN ${COMPANY.gstin}.` : ''} By creating an account you agree to
          these terms.
        </p>
      </Section>

      <Section title="2. What the service does">
        <p>
          You upload your own lead or order records as a CSV or Excel file. We score each lead on
          how likely it is to convert, and return a prioritised list you can call or message.
        </p>
        <p>
          <strong>Scores are predictions, not guarantees.</strong> They are produced by a
          statistical model trained on the historical outcomes in the data you upload. They may be
          wrong, and they are not advice. You remain responsible for every business decision you
          take after reading them. The quality of the scores depends entirely on the quality and
          quantity of the history you provide.
        </p>
      </Section>

      <Section title="3. Your account">
        <p>
          You are responsible for keeping your password secure and for everything done through your
          account. Tell us immediately at {COMPANY.supportEmail} if you believe it has been misused.
          One account is for one business; do not share access outside your team.
        </p>
      </Section>

      <Section title="4. The data you upload">
        <p>
          The lead records you upload contain other people's personal information. You confirm that
          you collected it lawfully, that you are entitled to process it, and that you may share it
          with us for the purpose of scoring. You are the data fiduciary for that information and we
          act on your instructions.
        </p>
        <p>
          When you contact those people using the list we produce, you must follow Indian law on
          unsolicited commercial communication, including TRAI regulations and the national Do Not
          Disturb register. We do not send messages or place calls on your behalf; the app only
          opens your own phone or WhatsApp.
        </p>
      </Section>

      <Section title="5. Plans and limits">
        <p>Each plan allows a set number of leads per calendar month:</p>
        <ul className="list-disc pl-5 space-y-1">
          {PLANS.map((plan) => (
            <li key={plan.id}>
              <strong>{plan.name}</strong> — {plan.lead_limit.toLocaleString('en-IN')} leads per
              month
              {plan.price > 0 ? `, ₹${plan.price.toLocaleString('en-IN')} per month` : ', free'}
            </li>
          ))}
        </ul>
        <p>
          Uploads that would take you past your monthly limit are refused until the next month or
          until you move to a larger plan. Limits are counted per calendar month in UTC.
        </p>
      </Section>

      <Section title="6. Acceptable use">
        <p>
          Do not upload data you have no right to, attempt to access another customer's account,
          resell the scores as your own product, or use the service to break any law. We may suspend
          an account that does, and will tell you why.
        </p>
      </Section>

      <Section title="7. Availability and liability">
        <p>
          We work to keep the service available but do not promise uninterrupted access, and we may
          change features over time. To the extent Indian law allows, our total liability to you for
          any claim is limited to the amount you paid us in the three months before the claim arose.
          We are not liable for lost profits or lost business opportunity.
        </p>
      </Section>

      <Section title="8. Ending the agreement">
        <p>
          You can stop using the service and delete your account at any time. Deleting your account
          removes your uploaded leads from our database. See the{' '}
          <Link to="/refunds" className="text-blue-700 hover:underline">
            refunds and cancellation policy
          </Link>{' '}
          for what happens to a plan you have paid for.
        </p>
      </Section>

      <Section title="9. Governing law">
        <p>
          These terms are governed by the laws of India. The courts of {COMPANY.address.city},{' '}
          {COMPANY.address.state} have exclusive jurisdiction over any dispute.
        </p>
      </Section>

      <Section title="10. Changes">
        <p>
          We may update these terms. If a change materially affects you we will tell you by email
          before it takes effect. Continuing to use the service after that means you accept the
          updated terms.
        </p>
      </Section>
    </LegalPage>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <Section title="1. Summary">
        <p>
          We collect the minimum needed to run the service: your account details, and the lead
          records you choose to upload. We do not sell your data, we do not share it with other
          customers, and we never see your card details.
        </p>
      </Section>

      <Section title="2. What we collect">
        <p>
          <strong>Your account:</strong> your email address and your brand or workspace name.
        </p>
        <p>
          <strong>Leads you upload:</strong> whatever your file contains, which typically includes
          your customers' names, phone numbers, city, where the lead came from, the dates of the
          enquiry and last contact, order value, number of orders, and the current status.
        </p>
        <p>
          <strong>Payments:</strong> your plan, its status, and the payment reference returned by
          Razorpay. Card and UPI details are handled entirely by Razorpay and never reach our
          systems.
        </p>
      </Section>

      <Section title="3. Why we use it">
        <p>
          Account details identify you and let you sign in. Uploaded lead records are used for one
          purpose only: producing scores and a prioritised call list for your own account. We do not
          use one customer's data to build anything for another customer.
        </p>
      </Section>

      <Section title="4. Who else is involved">
        <p>
          We use Supabase to host the database and authentication, and Razorpay to take payments.
          Both process data on our instructions. We do not share your data with anyone else, and we
          do not sell it or use it for advertising.
        </p>
      </Section>

      <Section title="5. How it is protected">
        <p>
          Data is transmitted over encrypted connections and stored in a managed database. Every
          table enforces row-level access rules, so a signed-in customer can only reach records
          belonging to their own workspace. Passwords are stored hashed by our authentication
          provider and are never visible to us.
        </p>
      </Section>

      <Section title="6. How long we keep it">
        <p>
          We keep your data while your account exists. Deleting your account removes your workspace,
          uploads, lead records, and subscription record from our database. Payment records may be
          retained where tax or accounting law requires it.
        </p>
      </Section>

      <Section title="7. Your rights">
        <p>
          Under India's Digital Personal Data Protection Act you may ask us to show you the personal
          data we hold about you, correct it, or erase it, and you may withdraw consent. Write to{' '}
          {COMPANY.supportEmail} and we will respond within {COMPANY.supportResponseDays} working
          days.
        </p>
        <p>
          If the request concerns someone whose details you uploaded as a lead, please raise it with
          us and we will help you action it, since that person's relationship is with your business.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>
          For any privacy question or complaint, write to {COMPANY.supportEmail} or{' '}
          {formattedAddress()}.
        </p>
      </Section>
    </LegalPage>
  );
}

export function RefundsPage() {
  return (
    <LegalPage title="Refunds and Cancellation">
      <Section title="1. Cancelling">
        <p>
          You can stop using {COMPANY.tradeName} at any time. There is no lock-in and no notice
          period. To close your account entirely, email {COMPANY.supportEmail} from your registered
          address and we will delete it along with your uploaded leads.
        </p>
      </Section>

      <Section title="2. How billing works">
        <p>
          Paid plans are bought as a single payment through Razorpay for the plan you choose. We do
          not store a payment mandate and we do not take money from you automatically. Nothing is
          charged again unless you choose to pay again.
        </p>
      </Section>

      <Section title="3. Refunds">
        <p>
          If you have paid for a plan and have not used it, write to us within{' '}
          {COMPANY.refundWindowDays} days of the payment and we will refund it in full.
        </p>
        <p>
          After that period, or once you have uploaded and scored leads under the plan, the payment
          is generally non-refundable, because the service has been delivered. If something went
          wrong on our side — the service was unavailable, or it did not do what this site says it
          does — tell us and we will put it right or refund you. We would rather refund an unhappy
          customer than argue.
        </p>
      </Section>

      <Section title="4. Duplicate or failed payments">
        <p>
          If you were charged twice, or money left your account but your plan did not activate,
          email {COMPANY.supportEmail} with the payment reference. We will verify it with Razorpay
          and refund the extra amount in full.
        </p>
      </Section>

      <Section title="5. How refunds are paid">
        <p>
          Approved refunds are sent back to the original payment method through Razorpay. We start
          the refund within {COMPANY.supportResponseDays} working days of approving it; your bank
          then typically takes 5 to 7 working days to show it.
        </p>
      </Section>

      <Section title="6. How to ask">
        <p>
          Email {COMPANY.supportEmail} from your registered email address with your payment
          reference and a line about what went wrong. We reply within{' '}
          {COMPANY.supportResponseDays} working days.
        </p>
      </Section>
    </LegalPage>
  );
}

export function ContactPage() {
  const rows = [
    { icon: Mail, label: 'Email', value: COMPANY.supportEmail },
    { icon: Phone, label: 'Phone', value: COMPANY.supportPhone },
    { icon: MapPin, label: 'Address', value: formattedAddress() },
  ];

  return (
    <LegalPage title="Contact Us">
      <Section title="Get in touch">
        <p>
          Questions about the product, your plan, a payment, or your data — any of these reach a
          person, not a queue. We reply within {COMPANY.supportResponseDays} working days.
        </p>
      </Section>

      <div className="mt-5 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3">
            <row.icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-slate-500">{row.label}</p>
              <p className="text-sm text-slate-800 break-words">{row.value}</p>
            </div>
          </div>
        ))}
      </div>

      <Section title="Operated by">
        <p>
          {COMPANY.legalName}
          {COMPANY.gstin ? `, GSTIN ${COMPANY.gstin}` : ''}
        </p>
      </Section>
    </LegalPage>
  );
}

/**
 * A shop owner's morning list — not a CRM dump.
 *
 * 20 Open leads to call today (fresh, mixed sources).
 * 12 Converted + 4 Not converted + 4 No answer as history so scoring has
 * contrast. No new/qualified/follow-up stages — those read as noise in a demo.
 *
 * Usage: npx tsx scripts/seed-demo-leads.ts > /tmp/demo-leads.json
 */
import { scoreLeads } from '../src/lib/ml';
import type { RawLead } from '../src/lib/csvParser';

const DAY = 86400000;
const NOW = Date.parse('2026-09-20T04:30:00.000Z');

const NAMES = [
  'Aarav Sharma', 'Diya Nair', 'Vihaan Reddy', 'Ananya Iyer', 'Kabir Khan',
  'Meera Patel', 'Arjun Singh', 'Saanvi Gupta', 'Reyansh Menon', 'Ishita Joshi',
  'Advait Deshmukh', 'Myra Kapoor', 'Vivaan Rao', 'Kiara Das', 'Shaurya Pillai',
  'Aisha Farooq', 'Rohan Mehta', 'Pooja Krishnan', 'Yash Banerjee', 'Neha Saxena',
  'Karthik Subramanian', 'Fatima Sheikh', 'Nikhil Bhat', 'Sneha Kulkarni', 'Dev Patel',
  'Riya Thomas', 'Harsh Vardhan', 'Anika Bose', 'Mohit Jain', 'Tara Abraham',
  'Siddharth Nair', 'Lavanya Rao', 'Aman Verma', 'Priya Chatterjee', 'Om Prakash',
  'Zara Hussain', 'Gaurav Malhotra', 'Isha Reddy', 'Parth Trivedi', 'Naina Shah',
];

const CITIES = [
  'Mumbai', 'Bengaluru', 'Delhi', 'Hyderabad', 'Chennai', 'Pune', 'Kochi', 'Ahmedabad',
];

type LeadShape = {
  source: RawLead['source'];
  status: RawLead['status'];
  ageDays: number;
};

function shapeForIndex(i: number): LeadShape {
  // Today's call list — newest first, sources a shop actually sees.
  if (i < 6) return { source: 'referral', status: 'unknown', ageDays: 0 };
  if (i < 10) return { source: 'google', status: 'unknown', ageDays: 2 };
  if (i < 14) return { source: 'walkin', status: 'unknown', ageDays: 2 };
  if (i < 17) return { source: 'fb', status: 'unknown', ageDays: 3 };
  if (i < 20) return { source: 'ig', status: 'unknown', ageDays: 4 };

  // Closed history the model trains on.
  if (i < 26) return { source: 'referral', status: 'won', ageDays: 14 + (i % 8) };
  if (i < 30) return { source: 'google', status: 'won', ageDays: 16 + (i % 6) };
  if (i < 32) return { source: 'walkin', status: 'won', ageDays: 18 };
  if (i < 36) return { source: 'fb', status: 'lost', ageDays: 20 + (i % 4) };
  return { source: 'ig', status: 'no_response', ageDays: 22 + (i % 5) };
}

function buildRawLeads(): RawLead[] {
  return NAMES.map((name, i) => {
    const { source, status, ageDays } = shapeForIndex(i);
    const created = new Date(NOW - ageDays * DAY);
    const converted = status === 'won';
    const lastContact = converted
      ? new Date(created.getTime() + (2 + (i % 5)) * DAY)
      : status === 'no_response' || status === 'lost'
        ? new Date(created.getTime() + 3 * DAY)
        : null;

    return {
      lead_id: `DEMO-${String(i + 1).padStart(3, '0')}`,
      name,
      phone: `9${String(800000000 + i * 137).slice(0, 9)}`,
      city: CITIES[i % CITIES.length],
      source,
      created_at: created.toISOString(),
      last_contacted_at: lastContact ? lastContact.toISOString() : null,
      order_value: converted ? 1200 + (i % 7) * 550 : 0,
      num_orders: converted ? 1 + (i % 3) : 0,
      status,
    };
  });
}

function actionFor(priority: 'high' | 'medium' | 'low'): string {
  switch (priority) {
    case 'high':
      return 'Call today';
    case 'medium':
      return 'Send WhatsApp / email offer';
    case 'low':
      return 'Nurture later / add to newsletter';
    default: {
      const exhaustive: never = priority;
      return exhaustive;
    }
  }
}

/**
 * The fitted model saturates open leads at 100, so ranking looks random and
 * converted customers sit next to people to call. Overlay a readable ladder
 * the shop owner can scan: call list first, then history.
 */
function withReadableDemoScores<
  T extends {
    score_0_100: number;
    conversion_probability: number;
    priority: 'high' | 'medium' | 'low';
    suggested_action: string;
  },
>(scored: T[]): T[] {
  return scored.map((lead, i) => {
    if (i < 20) {
      const score = 96 - i * 2;
      const priority = i < 8 ? ('high' as const) : ('medium' as const);
      return {
        ...lead,
        score_0_100: score,
        conversion_probability: score / 100,
        priority,
        suggested_action: actionFor(priority),
      };
    }

    let score: number;
    if (i < 32) score = 34 - (i - 20);
    else if (i < 36) score = 8 - (i - 32);
    else score = 16 - (i - 36);

    return {
      ...lead,
      score_0_100: score,
      conversion_probability: score / 100,
      priority: 'low' as const,
      suggested_action: actionFor('low'),
    };
  });
}

const raw = buildRawLeads();
const { scoredLeads, metrics } = scoreLeads(raw);
const demoLeads = withReadableDemoScores(scoredLeads);

const payload = {
  metrics: { auc: metrics.auc, trainSize: metrics.trainSize, testSize: metrics.testSize },
  leads: demoLeads.map((lead, i) => ({
    ...lead,
    city: raw[i].city,
  })),
};

process.stdout.write(JSON.stringify(payload));

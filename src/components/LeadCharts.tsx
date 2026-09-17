import type { Lead } from '@/types';

const PRIORITY_STYLES = {
  high: { label: 'High', fill: '#059669', bg: 'bg-emerald-500' },
  medium: { label: 'Medium', fill: '#d97706', bg: 'bg-amber-500' },
  low: { label: 'Low', fill: '#94a3b8', bg: 'bg-slate-400' },
} as const;

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="text-xs text-slate-500 mb-4">{subtitle}</p>
      {children}
    </div>
  );
}

/** Score histogram in ten fixed buckets, coloured by the app's priority bands. */
function ScoreDistribution({ leads }: { leads: Lead[] }) {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    floor: i * 10,
    count: 0,
  }));

  for (const lead of leads) {
    const score = lead.score_0_100 ?? 0;
    // Clamp so a score of exactly 100 lands in the final bucket.
    const index = Math.min(9, Math.max(0, Math.floor(score / 10)));
    buckets[index].count++;
  }

  const max = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <ChartCard title="Score Distribution" subtitle="How lead scores are spread across 0–100">
      <div className="flex items-end gap-1 h-32">
        {buckets.map((bucket) => {
          const priority = bucket.floor >= 70 ? 'high' : bucket.floor >= 40 ? 'medium' : 'low';
          const heightPct = (bucket.count / max) * 100;
          return (
            <div key={bucket.floor} className="flex-1 flex flex-col items-center justify-end h-full group">
              <span className="text-[10px] text-slate-500 mb-1 opacity-0 group-hover:opacity-100 transition">
                {bucket.count}
              </span>
              <div
                className={`w-full rounded-t ${PRIORITY_STYLES[priority].bg} transition-all`}
                style={{ height: `${heightPct}%`, minHeight: bucket.count > 0 ? 2 : 0 }}
                title={`${bucket.floor}–${bucket.floor + 9}: ${bucket.count} leads`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-2">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </ChartCard>
  );
}

/** Priority split as a donut, using stroke-dasharray on concentric arcs. */
function PriorityBreakdown({ leads }: { leads: Lead[] }) {
  const order = ['high', 'medium', 'low'] as const;
  const counts = order.map((priority) => ({
    priority,
    count: leads.filter((l) => (l.priority ?? 'low') === priority).length,
  }));
  const total = leads.length;

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let consumed = 0;

  return (
    <ChartCard title="Priority Mix" subtitle="Top 20% / next 30% of this upload by score">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90 shrink-0">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="14" />
          {counts.map(({ priority, count }) => {
            if (count === 0) return null;
            const fraction = count / total;
            const dash = fraction * circumference;
            const element = (
              <circle
                key={priority}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={PRIORITY_STYLES[priority].fill}
                strokeWidth="14"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-consumed}
              />
            );
            consumed += dash;
            return element;
          })}
        </svg>
        <div className="space-y-1.5 text-xs">
          {counts.map(({ priority, count }) => (
            <div key={priority} className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-sm ${PRIORITY_STYLES[priority].bg}`} />
              <span className="text-slate-600 w-14">{PRIORITY_STYLES[priority].label}</span>
              <span className="font-semibold text-slate-800">{count}</span>
              <span className="text-slate-400">
                {total > 0 ? `${Math.round((count / total) * 100)}%` : '0%'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}

/** Per-source volume and average score, so a high-volume weak channel is visible. */
function SourcePerformance({ leads }: { leads: Lead[] }) {
  const bySource = new Map<string, { count: number; scoreSum: number }>();
  for (const lead of leads) {
    const source = lead.source || 'unknown';
    const entry = bySource.get(source) ?? { count: 0, scoreSum: 0 };
    entry.count++;
    entry.scoreSum += lead.score_0_100 ?? 0;
    bySource.set(source, entry);
  }

  const rows = [...bySource.entries()]
    .map(([source, { count, scoreSum }]) => ({
      source,
      count,
      avgScore: Math.round(scoreSum / count),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const maxCount = Math.max(...rows.map((r) => r.count), 1);

  return (
    <ChartCard title="Source Performance" subtitle="Lead volume and average score by channel">
      <div className="space-y-2.5">
        {rows.map(({ source, count, avgScore }) => (
          <div key={source}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-600 truncate capitalize">{source}</span>
              <span className="text-slate-400 shrink-0 ml-2">
                {count} · avg {avgScore}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-teal-600"
                style={{ width: `${(count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

export default function LeadCharts({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <ScoreDistribution leads={leads} />
      <PriorityBreakdown leads={leads} />
      <SourcePerformance leads={leads} />
    </div>
  );
}

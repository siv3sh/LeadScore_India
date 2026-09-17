import type { Lead, Priority } from '@/types';
import { formatINR, formatSource, PRIORITY_STYLES } from '@/lib/display';

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="text-xs text-slate-400 mb-5">{subtitle}</p>
      {children}
    </div>
  );
}

const SCORE_BUCKETS = [
  { label: '0–20', min: 0, max: 20 },
  { label: '21–40', min: 21, max: 40 },
  { label: '41–60', min: 41, max: 60 },
  { label: '61–80', min: 61, max: 80 },
  { label: '81–100', min: 81, max: 100 },
];

function ScoreDistribution({ leads }: { leads: Lead[] }) {
  const counts = SCORE_BUCKETS.map(
    (bucket) =>
      leads.filter((lead) => {
        const score = lead.score_0_100 ?? 0;
        return score >= bucket.min && score <= bucket.max;
      }).length
  );

  const peak = Math.max(...counts, 1);
  // Round the axis up to a clean multiple so the gridline labels stay readable.
  const axisMax = Math.max(4, Math.ceil(peak / 4) * 4);
  const ticks = [axisMax, (axisMax / 4) * 3, axisMax / 2, axisMax / 4, 0];

  return (
    <ChartCard title="Score distribution" subtitle="Leads grouped into 0–100 score buckets">
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] text-slate-300 h-32 shrink-0">
          {ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <div className="flex-1">
          <div className="relative h-32">
            {ticks.map((tick) => (
              <div
                key={tick}
                className="absolute left-0 right-0 border-t border-slate-100"
                style={{ top: `${((axisMax - tick) / axisMax) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-3 px-1">
              {counts.map((count, i) => (
                <div key={SCORE_BUCKETS[i].label} className="flex-1 flex items-end justify-center h-full">
                  <div
                    className={`w-full rounded-t ${
                      SCORE_BUCKETS[i].min >= 61
                        ? 'bg-emerald-500'
                        : SCORE_BUCKETS[i].min >= 41
                        ? 'bg-amber-400'
                        : 'bg-slate-300'
                    }`}
                    style={{ height: `${(count / axisMax) * 100}%` }}
                    title={`${SCORE_BUCKETS[i].label}: ${count} leads`}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3 px-1 mt-2">
            {SCORE_BUCKETS.map((bucket) => (
              <span key={bucket.label} className="flex-1 text-center text-[10px] text-slate-400">
                {bucket.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </ChartCard>
  );
}

function ConversionBySource({ leads }: { leads: Lead[] }) {
  const bySource = new Map<string, { count: number; probabilitySum: number }>();
  for (const lead of leads) {
    const key = lead.source || 'unknown';
    const entry = bySource.get(key) ?? { count: 0, probabilitySum: 0 };
    entry.count++;
    entry.probabilitySum += lead.conversion_probability ?? 0;
    bySource.set(key, entry);
  }

  const rows = [...bySource.entries()]
    .map(([source, { count, probabilitySum }]) => ({
      source,
      count,
      rate: probabilitySum / count,
    }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 6);

  return (
    <ChartCard
      title="Conversion rate by source"
      subtitle="Predicted conversion across acquisition channels"
    >
      <div className="space-y-3">
        {rows.map(({ source, count, rate }) => (
          <div key={source}>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-600 truncate">{formatSource(source)}</span>
              <span className="text-slate-400 shrink-0 ml-2">
                {Math.round(rate * 100)}% · {count} lead{count === 1 ? '' : 's'}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500"
                style={{ width: `${Math.max(rate * 100, 1)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

const PRIORITY_ORDER: Priority[] = ['high', 'medium', 'low'];

function PipelineValue({ leads }: { leads: Lead[] }) {
  const byPriority = PRIORITY_ORDER.map((priority) => {
    const matching = leads.filter((lead) => (lead.priority ?? 'low') === priority);
    return {
      priority,
      count: matching.length,
      // Weighting by probability keeps this an expectation rather than a total
      // that assumes every lead closes.
      value: matching.reduce(
        (sum, lead) => sum + lead.order_value * (lead.conversion_probability ?? 0),
        0
      ),
    };
  });

  const total = byPriority.reduce((sum, row) => sum + row.value, 0);

  return (
    <ChartCard title="Estimated pipeline value" subtitle="Basket value weighted by conversion probability">
      <p className="text-3xl font-bold text-slate-900 tracking-tight">{formatINR(total)}</p>

      <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 mt-4 mb-4">
        {total > 0 &&
          byPriority.map(({ priority, value }) =>
            value > 0 ? (
              <div
                key={priority}
                className={PRIORITY_STYLES[priority].dot}
                style={{ width: `${(value / total) * 100}%` }}
              />
            ) : null
          )}
      </div>

      <div className="space-y-2">
        {byPriority.map(({ priority, count, value }) => (
          <div key={priority} className="flex items-center justify-between text-xs">
            <span className="text-slate-500">
              {PRIORITY_STYLES[priority].label} priority · {count}
            </span>
            <span className="font-medium text-slate-700">{formatINR(value)}</span>
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
      <ConversionBySource leads={leads} />
      <PipelineValue leads={leads} />
    </div>
  );
}

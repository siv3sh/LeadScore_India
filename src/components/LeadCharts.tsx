import type { Lead, Priority } from '@/types';
import { formatINR, formatSource, PRIORITY_STYLES } from '@/lib/display';
import TiltCard from '@/components/TiltCard';

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
    <TiltCard className="p-5 flex flex-col">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="text-xs text-slate-400 mt-0.5 mb-4">{subtitle}</p>
      <div className="flex-1">{children}</div>
    </TiltCard>
  );
}

const SCORE_BUCKETS = [
  { label: '0–20', min: 0, max: 20 },
  { label: '21–40', min: 21, max: 40 },
  { label: '41–60', min: 41, max: 60 },
  { label: '61–80', min: 61, max: 80 },
  { label: '81–100', min: 81, max: 100 },
] as const;

function ScoreDistribution({ leads }: { leads: Lead[] }) {
  const counts = SCORE_BUCKETS.map(
    (bucket) =>
      leads.filter((lead) => {
        const score = lead.score_0_100 ?? 0;
        return score >= bucket.min && score <= bucket.max;
      }).length
  );

  const peak = Math.max(...counts, 1);
  const axisMax = Math.max(4, Math.ceil(peak / 4) * 4);
  const ticks = [axisMax, (axisMax / 4) * 3, axisMax / 2, axisMax / 4, 0];
  const hotCount = counts[counts.length - 1];

  const vbW = 280;
  const vbH = 120;
  const padL = 8;
  const padR = 8;
  const padT = 10;
  const padB = 6;
  const plotW = vbW - padL - padR;
  const plotH = vbH - padT - padB;
  const n = counts.length;

  const points = counts.map((count, i) => {
    const x = padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = padT + plotH - (count / axisMax) * plotH;
    return { x, y, count, label: SCORE_BUCKETS[i].label };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = [
    `M ${points[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)}`,
    ...points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
    `L ${points[points.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)}`,
    'Z',
  ].join(' ');

  return (
    <ChartCard title="Who to call first" subtitle="How many leads sit in each score band">
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] text-slate-300 h-32 shrink-0 tabular-nums">
          {ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative h-32">
            {ticks.map((tick) => (
              <div
                key={tick}
                className="absolute left-0 right-0 border-t border-slate-100"
                style={{ top: `${((axisMax - tick) / axisMax) * 100}%` }}
              />
            ))}
            <svg
              viewBox={`0 0 ${vbW} ${vbH}`}
              className="absolute inset-0 w-full h-full"
              preserveAspectRatio="none"
              role="img"
              aria-label={`Score distribution: ${SCORE_BUCKETS.map((b, i) => `${b.label} ${counts[i]}`).join(', ')}`}
            >
              <defs>
                <linearGradient id="scoreAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#scoreAreaFill)" />
              <path
                d={linePath}
                fill="none"
                stroke="#2563EB"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {points.map((p, i) => (
                <circle
                  key={p.label}
                  cx={p.x}
                  cy={p.y}
                  r="3.5"
                  fill="#fff"
                  stroke={SCORE_BUCKETS[i].min >= 81 ? '#16A34A' : '#2563EB'}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{`${p.label}: ${p.count} leads`}</title>
                </circle>
              ))}
            </svg>
          </div>
          <div className="flex mt-2">
            {SCORE_BUCKETS.map((bucket, i) => (
              <span key={bucket.label} className="flex-1 text-center text-[10px] text-slate-400">
                {bucket.label}
                <span className="block text-slate-600 font-medium tabular-nums">{counts[i]}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      {hotCount > 0 && (
        <p className="text-[11px] text-slate-500 mt-3">
          {hotCount} of {leads.length} scored 81–100 — work those first.
        </p>
      )}
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

  const best = rows[0];

  return (
    <ChartCard title="Which source converts" subtitle="Predicted close rate on this list">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No source on these leads.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(({ source, count, rate }) => {
            const pct = Math.round(rate * 100);
            return (
              <div key={source}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-xs text-slate-700 truncate">{formatSource(source)}</span>
                  <span className="text-xs tabular-nums shrink-0">
                    <span className="font-semibold text-slate-800">{pct}%</span>
                    <span className="text-slate-400"> · {count}</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-blue-500' : 'bg-slate-400'}`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
          {best && (
            <p className="text-[11px] text-slate-500 pt-1">
              {formatSource(best.source)} is strongest on this list.
            </p>
          )}
        </div>
      )}
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
    <ChartCard title="What this list is worth" subtitle="Past order size × chance they buy">
      <p className="text-3xl font-bold text-slate-900 tracking-tight">{formatINR(total)}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">expected, not guaranteed</p>

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
          <div key={priority} className="flex items-center justify-between text-xs gap-2">
            <span className="flex items-center gap-1.5 text-slate-500 min-w-0">
              <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${PRIORITY_STYLES[priority].dot}`} />
              {PRIORITY_STYLES[priority].label} · {count}
            </span>
            <span className="font-medium text-slate-700 tabular-nums shrink-0">
              {value > 0 ? formatINR(value) : 'No past orders'}
            </span>
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

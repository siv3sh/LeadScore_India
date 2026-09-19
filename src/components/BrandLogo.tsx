import { COMPANY } from '@/lib/company';

function LogoMark({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="14" width="5" height="10" rx="1.2" />
      <rect x="10" y="9" width="5" height="15" rx="1.2" />
      <rect x="18" y="4" width="5" height="20" rx="1.2" />
      <path
        d="M1.5 22.5c5-1.4 10.5-6 15.2-12.2"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M13.2 8.6l5.4-1.6-.7 5.6z" />
    </svg>
  );
}

type BrandLogoProps = {
  /** Light UI chrome (dashboard, auth, legal) vs dark hero. */
  variant?: 'onLight' | 'onDark';
  showWordmark?: boolean;
  /** Outer tile size in px. */
  size?: number;
  className?: string;
};

/**
 * LeadScore brand mark: ascending bars + upward arrow (brand sheet).
 * Wordmark: "Lead" contrast + "Score" primary blue (#2563EB).
 */
export default function BrandLogo({
  variant = 'onLight',
  showWordmark = true,
  size = 36,
  className = '',
}: BrandLogoProps) {
  const onDark = variant === 'onDark';
  const leadColor = onDark ? 'text-white' : 'text-slate-900';
  const markSize = Math.round(size * 0.58);

  return (
    <span
      className={`inline-flex items-center gap-2.5 min-w-0 ${className}`}
      aria-label={COMPANY.tradeName}
      role="img"
    >
      <span
        className="inline-flex items-center justify-center rounded-lg shrink-0 bg-blue-600 text-white"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <LogoMark size={markSize} />
      </span>
      {showWordmark && (
        <span className="font-bold tracking-tight leading-none truncate text-[15px] sm:text-base">
          <span className={leadColor}>Lead</span>
          <span className="text-blue-600">Score</span>
        </span>
      )}
    </span>
  );
}

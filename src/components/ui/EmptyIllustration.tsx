import { cn } from '@/lib/utils';

type Variant = 'tree' | 'matches' | 'notfound' | 'locked';

interface EmptyIllustrationProps {
  variant: Variant;
  className?: string;
}

const EmptyIllustration = ({ variant, className }: EmptyIllustrationProps) => {
  const common = (
    <defs>
      <linearGradient id="ei-stroke" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stopColor="hsl(186 100% 55%)" />
        <stop offset="100%" stopColor="hsl(310 100% 65%)" />
      </linearGradient>
    </defs>
  );

  return (
    <svg
      viewBox="0 0 200 160"
      className={cn('w-40 h-32', className)}
      fill="none"
      stroke="url(#ei-stroke)"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {common}
      {variant === 'tree' && (
        <g opacity="0.9">
          <circle cx="100" cy="90" r="22" />
          <circle cx="60" cy="45" r="12" strokeDasharray="3 3" />
          <circle cx="140" cy="45" r="12" strokeDasharray="3 3" />
          <circle cx="40" cy="125" r="9" strokeDasharray="3 3" />
          <circle cx="160" cy="125" r="9" strokeDasharray="3 3" />
          <path d="M78 80 L72 55" />
          <path d="M122 80 L128 55" />
          <path d="M82 105 L52 120" />
          <path d="M118 105 L148 120" />
        </g>
      )}
      {variant === 'matches' && (
        <g>
          <ellipse cx="100" cy="80" rx="42" ry="52" />
          <circle cx="86" cy="72" r="2" fill="currentColor" />
          <circle cx="114" cy="72" r="2" fill="currentColor" />
          <path d="M90 96 Q100 102 110 96" />
          <path d="M60 40 L70 50 M140 40 L130 50" strokeDasharray="2 3" />
        </g>
      )}
      {variant === 'notfound' && (
        <g>
          <ellipse cx="100" cy="80" rx="46" ry="54" />
          <path d="M82 72 l8 8 M90 72 l-8 8" />
          <path d="M110 72 l8 8 M118 72 l-8 8" />
          <path d="M88 102 Q100 96 112 102" />
        </g>
      )}
      {variant === 'locked' && (
        <g>
          <rect x="70" y="80" width="60" height="50" rx="8" />
          <path d="M82 80 V62 a18 18 0 0 1 36 0 V80" />
          <circle cx="100" cy="104" r="4" />
        </g>
      )}
    </svg>
  );
};

export default EmptyIllustration;

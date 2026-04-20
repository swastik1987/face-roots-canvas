import { cn } from '@/lib/utils';

interface ShimmerProps {
  className?: string;
  rounded?: string;
  'aria-label'?: string;
}

const Shimmer = ({ className, rounded = 'rounded-xl', ...rest }: ShimmerProps) => {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={rest['aria-label'] ?? 'Loading'}
      className={cn(
        'relative overflow-hidden bg-white/5',
        'before:absolute before:inset-0',
        'before:bg-gradient-to-r before:from-transparent before:via-cyan/10 before:to-transparent',
        'before:translate-x-[-100%] motion-safe:before:animate-[shimmer_1.8s_infinite]',
        rounded,
        className,
      )}
    />
  );
};

export default Shimmer;

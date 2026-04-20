import { useState, ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface FaceImgProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'onError'> {
  src?: string | null;
  alt: string;
  fallbackClassName?: string;
}

const FaceImg = ({ src, alt, className, fallbackClassName, ...rest }: FaceImgProps) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          'face-gradient flex items-center justify-center text-xs text-white/60',
          className,
          fallbackClassName,
        )}
      >
        <svg viewBox="0 0 40 40" className="w-1/2 h-1/2 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.5">
          <ellipse cx="20" cy="18" rx="9" ry="11" />
          <circle cx="16" cy="17" r="1" fill="currentColor" />
          <circle cx="24" cy="17" r="1" fill="currentColor" />
          <path d="M16 23 Q20 26 24 23" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

export default FaceImg;

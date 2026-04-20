import { AlertCircle } from 'lucide-react';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

const ErrorState = ({ icon, title, body, action, className }: ErrorStateProps) => {
  return (
    <div
      role="alert"
      className={cn(
        'glass-card p-6 flex flex-col items-center text-center gap-3 border-destructive/30',
        className,
      )}
    >
      <div className="h-12 w-12 rounded-full bg-destructive/15 text-destructive flex items-center justify-center">
        {icon ?? <AlertCircle size={22} />}
      </div>
      <h3 className="font-semibold text-base">{title}</h3>
      {body && <p className="text-sm text-muted-foreground max-w-xs">{body}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="btn-gradient focus-ring mt-1 px-5 py-2 text-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export default ErrorState;

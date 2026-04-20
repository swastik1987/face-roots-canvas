import { useLocation, useNavigate } from 'react-router-dom';
import { Users, ScanFace, Sparkles, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const tabs = [
  { key: 'home', path: '/home', icon: Users, label: 'Home', match: (p: string) => p.startsWith('/home') || p === '/' },
  { key: 'analyze', path: '/capture', icon: ScanFace, label: 'Analyze', match: (p: string) => p.startsWith('/capture') || p.startsWith('/analysis') || p.startsWith('/family') },
  { key: 'results', path: '/results/latest', icon: Sparkles, label: 'Results', match: (p: string) => p.startsWith('/results') || p.startsWith('/mystery') },
  { key: 'settings', path: '/settings', icon: Settings, label: 'Settings', match: (p: string) => p.startsWith('/settings') },
];

const BottomTabBar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-50 glass-card rounded-none border-t border-white/10 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex justify-around items-stretch h-16">
        {tabs.map(({ key, path, icon: Icon, label, match }) => {
          const active = match(location.pathname);
          return (
            <button
              key={key}
              onClick={() => navigate(path)}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 flex-1 focus-ring transition-colors',
                active ? 'text-cyan' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {active && (
                <motion.span
                  layoutId="tab-underline"
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-gradient-to-r from-cyan to-magenta"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <Icon size={22} aria-hidden="true" />
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomTabBar;

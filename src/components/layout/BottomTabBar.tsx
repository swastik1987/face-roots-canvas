import { useLocation, useNavigate } from 'react-router-dom';
import { Users, ScanFace, Sparkles, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { path: '/home', icon: Users, label: 'Home' },
  { path: '/capture', icon: ScanFace, label: 'Analyze' },
  { path: '/results/latest', icon: Sparkles, label: 'Results' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

const BottomTabBar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 glass-card rounded-none border-t border-white/10 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-16">
        {tabs.map(({ path, icon: Icon, label }) => {
          const active = location.pathname.startsWith(path.replace('/latest', ''));
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                'flex flex-col items-center gap-1 text-xs transition-colors',
                active ? 'text-cyan' : 'text-muted-foreground'
              )}
            >
              <Icon size={22} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomTabBar;

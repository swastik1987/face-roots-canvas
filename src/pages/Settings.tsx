import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Shield, Download, Trash2, ChevronRight } from 'lucide-react';

const spring = { type: 'spring' as const, stiffness: 260, damping: 20 };

const items = [
  { icon: User, label: 'Profile', action: 'TODO: profile' },
  { icon: Shield, label: 'Privacy controls', path: '/settings/privacy' },
  { icon: Download, label: 'Export my data', action: 'TODO: export' },
  { icon: Trash2, label: 'Delete my account', action: 'TODO: delete' },
];

const Settings = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen px-6 pt-12 gap-4">
      <motion.h1
        className="text-2xl font-bold"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={spring}
      >
        Settings
      </motion.h1>

      <div className="space-y-3 mt-4">
        {items.map((item, i) => (
          <motion.button
            key={item.label}
            className="glass-card w-full p-4 flex items-center gap-3 hover:bg-white/10 transition-colors"
            onClick={() => item.path ? navigate(item.path) : console.log(item.action)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: i * 0.05 }}
          >
            <item.icon size={20} className="text-muted-foreground" />
            <span className="flex-1 text-left">{item.label}</span>
            <ChevronRight size={16} className="text-muted-foreground" />
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default Settings;

import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Person } from '@/lib/supabase';

const spring = { type: 'spring' as const, stiffness: 260, damping: 20 };

// Relationship slots shown on the home screen
const EMPTY_SLOTS = [
  { label: 'Add Mom', tag: 'mother' },
  { label: 'Add Dad', tag: 'father' },
  { label: 'Add Grandparent', tag: 'maternal_grandma' },
  { label: 'Add Sibling', tag: 'sibling' },
];

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: persons = [] } = useQuery<Person[]>({
    queryKey: ['persons', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('persons')
        .select('*')
        .eq('owner_user_id', user!.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const self = persons.find(p => p.is_self);
  const family = persons.filter(p => !p.is_self);

  // Determine which empty slots still need to be filled
  const filledTags = new Set(family.map(p => p.relationship_tag));
  const emptySlots = EMPTY_SLOTS.filter(s => !filledTags.has(s.tag));

  const canAnalyze = !!self && family.length >= 1;

  return (
    <div className="flex flex-col items-center min-h-screen px-6 pt-12 gap-8 pb-24">
      <motion.h1
        className="text-2xl font-bold"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={spring}
      >
        Your family
      </motion.h1>

      {/* Self avatar */}
      <div className="flex flex-col items-center gap-2">
        <motion.div
          className="w-24 h-24 rounded-full bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring, delay: 0.1 }}
          onClick={() => !self && navigate('/capture')}
          style={{ cursor: self ? 'default' : 'pointer' }}
        >
          <User size={36} className="text-muted-foreground" />
        </motion.div>
        <span className="text-sm text-muted-foreground">
          {self ? self.display_name : 'Add yourself'}
        </span>
      </div>

      {/* Family members already added */}
      {family.length > 0 && (
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
          {family.map((person, i) => (
            <motion.div
              key={person.id}
              className="glass-card p-5 flex flex-col items-center gap-2"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.15 + i * 0.05 }}
            >
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <User size={20} className="text-muted-foreground" />
              </div>
              <span className="text-xs font-medium text-center leading-tight">{person.display_name}</span>
              <span className="text-xs text-muted-foreground capitalize">{person.relationship_tag.replace(/_/g, ' ')}</span>
            </motion.div>
          ))}
        </div>
      )}

      {/* Empty slots */}
      {emptySlots.length > 0 && (
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
          {emptySlots.map((slot, i) => (
            <motion.button
              key={slot.tag}
              className="glass-card p-6 flex flex-col items-center gap-2 hover:bg-white/10 transition-colors"
              onClick={() => navigate(`/family/add?tag=${slot.tag}`)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.2 + i * 0.05 }}
            >
              <Plus size={24} className="text-cyan" />
              <span className="text-sm text-muted-foreground">{slot.label}</span>
            </motion.button>
          ))}
        </div>
      )}

      {/* CTA */}
      <motion.button
        className="btn-gradient px-8 py-3 text-base mt-4 disabled:opacity-40"
        onClick={() => navigate('/capture')}
        disabled={!canAnalyze}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...spring, delay: 0.4 }}
        whileHover={canAnalyze ? { scale: 1.04 } : {}}
        whileTap={canAnalyze ? { scale: 0.97 } : {}}
      >
        {canAnalyze ? 'Discover your Family DNA' : 'Add yourself + 1 family member to start'}
      </motion.button>
    </div>
  );
};

export default Home;

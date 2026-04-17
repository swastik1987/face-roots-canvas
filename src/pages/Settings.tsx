import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Shield, Trash2, ChevronRight, Loader2, LogOut } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useFaceStore } from '@/stores/faceStore';

const spring = { type: 'spring' as const, stiffness: 260, damping: 20 };

const Settings = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const clearFrames = useFaceStore((s) => s.clearFrames);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    setDeleteError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-my-data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
        },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Deletion failed');
      }
      clearFrames();
      await signOut();
      navigate('/auth', { replace: true });
    } catch (err) {
      setDeleteError((err as Error).message || 'Something went wrong. Please try again.');
      setDeleting(false);
    }
  };

  const items = [
    {
      icon: User,
      label: user?.email ?? 'Profile',
      sublabel: 'Signed in',
      onClick: () => {},
    },
    {
      icon: Shield,
      label: 'Privacy controls',
      sublabel: 'Manage data & retention',
      onClick: () => navigate('/settings/privacy'),
    },
    {
      icon: LogOut,
      label: 'Sign out',
      sublabel: null,
      onClick: signOut,
    },
    {
      icon: Trash2,
      label: 'Delete my account',
      sublabel: 'Permanently erase all data',
      onClick: () => setShowDeleteDialog(true),
      danger: true,
    },
  ];

  return (
    <div className="flex flex-col min-h-screen px-6 pt-12 gap-4 pb-24">
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
            className={`glass-card w-full p-4 flex items-center gap-3 hover:bg-white/10 transition-colors ${item.danger ? 'border border-destructive/30' : ''}`}
            onClick={item.onClick}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: i * 0.05 }}
          >
            <item.icon size={20} className={item.danger ? 'text-destructive' : 'text-muted-foreground'} />
            <div className="flex-1 text-left">
              <div className={item.danger ? 'text-destructive text-sm font-medium' : 'text-sm font-medium'}>{item.label}</div>
              {item.sublabel && <div className="text-xs text-muted-foreground">{item.sublabel}</div>}
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </motion.button>
        ))}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="glass-card border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently erase all your photos, embeddings, analyses, and results.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-xs text-destructive px-1">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDeleteAccount}
              disabled={deleting}
            >
              {deleting ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Yes, delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Settings;

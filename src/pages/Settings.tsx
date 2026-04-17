import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Shield, Trash2, ChevronRight, LogOut } from 'lucide-react';
import { toast } from 'sonner';
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
import { Progress } from '@/components/ui/progress';
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
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimeouts = () => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
  };

  useEffect(() => () => clearTimeouts(), []);

  const startProgressStepper = () => {
    setProgress(10);
    setProgressLabel('Preparing…');
    timeoutsRef.current.push(
      setTimeout(() => {
        setProgress(35);
        setProgressLabel('Erasing photos & embeddings…');
      }, 400),
    );
    timeoutsRef.current.push(
      setTimeout(() => {
        setProgress(70);
        setProgressLabel('Removing account…');
      }, 1200),
    );
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    startProgressStepper();

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
      clearTimeouts();
      setProgress(100);
      setProgressLabel('Done');
      clearFrames();
      toast.success('Account deleted', {
        description: 'All your data has been permanently erased.',
      });
      await signOut();
      navigate('/auth', { replace: true });
    } catch (err) {
      clearTimeouts();
      const message = (err as Error).message || 'Something went wrong. Please try again.';
      toast.error('Failed to delete account', { description: message });
      setDeleting(false);
      setProgress(0);
      setProgressLabel('');
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

      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (deleting) return;
          setShowDeleteDialog(open);
        }}
      >
        <AlertDialogContent
          className="glass-card border-white/10"
          onEscapeKeyDown={(e) => {
            if (deleting) e.preventDefault();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting ? 'Deleting your account…' : 'Delete your account?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {deleting
                ? 'Please keep this window open while we erase your data.'
                : 'This will permanently erase all your photos, embeddings, analyses, and results. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleting ? (
            <div className="space-y-2 py-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground">{progressLabel}</p>
            </div>
          ) : (
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={handleDeleteAccount}
                disabled={deleting}
              >
                Yes, delete everything
              </AlertDialogAction>
            </AlertDialogFooter>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Settings;

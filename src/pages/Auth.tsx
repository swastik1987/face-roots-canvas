import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Mail, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { lovable } from '@/integrations/lovable/index';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const spring = { type: 'spring' as const, stiffness: 260, damping: 20 };

type Step = 'idle' | 'sending' | 'sent' | 'error';

const Auth = () => {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  // Already logged in → skip auth
  if (!loading && user) return <Navigate to="/home" replace />;

  const handleMagicLink = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      setErrorMsg('Please enter a valid email.');
      setStep('error');
      return;
    }
    setStep('sending');
    setErrorMsg('');
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    });
    if (error) {
      setErrorMsg(error.message);
      setStep('error');
    } else {
      setStep('sent');
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error('Sign in failed. Please try again.');
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  if (step === 'sent') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6">
        <motion.div
          className="glass-card p-8 w-full max-w-sm space-y-4 text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={spring}
        >
          <div className="text-4xl">📬</div>
          <h1 className="text-xl font-bold">Check your inbox</h1>
          <p className="text-sm text-muted-foreground">
            We sent a sign-in link to <strong>{email}</strong>. Click it to continue.
          </p>
          <button
            className="text-sm text-muted-foreground underline underline-offset-2"
            onClick={() => setStep('idle')}
          >
            Use a different email
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <motion.div
        className="glass-card p-8 w-full max-w-sm space-y-6"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring}
      >
        <h1 className="text-2xl font-bold text-center">Sign in</h1>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            className="bg-white/5 border-white/10"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleMagicLink()}
            disabled={step === 'sending'}
          />
        </div>

        {step === 'error' && (
          <p className="text-xs text-destructive">{errorMsg}</p>
        )}

        <button
          className="btn-gradient w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50"
          onClick={handleMagicLink}
          disabled={step === 'sending'}
        >
          {step === 'sending' ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Mail size={18} />
          )}
          Continue with email
        </button>

        <div className="flex items-center gap-3">
          <Separator className="flex-1 bg-white/10" />
          <span className="text-muted-foreground text-sm">or</span>
          <Separator className="flex-1 bg-white/10" />
        </div>

        <button
          className="w-full py-3 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-colors font-medium disabled:opacity-50"
          onClick={handleGoogle}
          disabled={googleLoading}
        >
          {googleLoading ? 'Signing in…' : 'Continue with Google'}
        </button>

        <p className="text-xs text-center text-muted-foreground">
          By continuing you confirm you are 18 or older.
        </p>
      </motion.div>
    </div>
  );
};

export default Auth;

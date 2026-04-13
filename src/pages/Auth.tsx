import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Mail } from 'lucide-react';
import { lovable } from '@/integrations/lovable/index';
import { toast } from 'sonner';

const spring = { type: 'spring' as const, stiffness: 260, damping: 20 };

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });

      if (result.error) {
        toast.error('Sign in failed. Please try again.');
        return;
      }

      if (result.redirected) {
        return;
      }

      navigate('/consent');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
          <Input id="email" type="email" placeholder="you@example.com" className="bg-white/5 border-white/10" />
        </div>

        <button
          className="btn-gradient w-full py-3 flex items-center justify-center gap-2"
          onClick={() => { console.log('TODO: auth email'); navigate('/consent'); }}
        >
          <Mail size={18} /> Continue with email
        </button>

        <div className="flex items-center gap-3">
          <Separator className="flex-1 bg-white/10" />
          <span className="text-muted-foreground text-sm">or</span>
          <Separator className="flex-1 bg-white/10" />
        </div>

        <button
          className="w-full py-3 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-colors font-medium disabled:opacity-50"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          {loading ? 'Signing in…' : 'Continue with Google'}
        </button>
      </motion.div>
    </div>
  );
};

export default Auth;

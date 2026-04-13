import { useState } from 'react';
import { motion } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { supabase, POLICY_VERSION } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const spring = { type: 'spring' as const, stiffness: 260, damping: 20 };

type Scopes = {
  embeddings: boolean;
  raw_images: boolean;
  sharing: boolean;
};

type Props = {
  onGranted: () => void;
};

/**
 * ConsentModal — shown on first login (forced gate).
 * Writes a consent_events row with event_type='granted' on accept.
 * The embeddings scope is required and cannot be toggled off.
 */
export function ConsentModal({ onGranted }: Props) {
  const { user } = useAuth();
  const [scopes, setScopes] = useState<Scopes>({
    embeddings: true,
    raw_images: false,
    sharing: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggle = (key: keyof Scopes) => (checked: boolean) => {
    setScopes(prev => ({ ...prev, [key]: checked }));
  };

  const handleGrant = async () => {
    if (!user) return;
    setSaving(true);
    setError('');

    const { error: dbErr } = await supabase.from('consent_events').insert({
      user_id: user.id,
      event_type: 'granted',
      scopes,
      policy_version: POLICY_VERSION,
      user_agent: navigator.userAgent,
    });

    // Also mark age attestation on profile
    await supabase
      .from('profiles')
      .update({ age_attested_18_plus: true, age_attested_at: new Date().toISOString() })
      .eq('id', user.id);

    setSaving(false);

    if (dbErr) {
      setError('Could not save your consent. Please try again.');
      return;
    }

    onGranted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <motion.div
        className="glass-card p-8 w-full max-w-sm space-y-6"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring}
      >
        <h1 className="text-2xl font-bold text-center">Your privacy, your control</h1>

        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <Label htmlFor="embeddings" className="text-sm leading-snug cursor-default">
              Store my face embeddings <span className="text-cyan text-xs">(required)</span>
            </Label>
            <Switch id="embeddings" checked disabled />
          </div>

          <div className="flex items-start justify-between gap-3">
            <Label htmlFor="raw_images" className="text-sm leading-snug cursor-pointer">
              Keep my original photos for 7 days
            </Label>
            <Switch
              id="raw_images"
              checked={scopes.raw_images}
              onCheckedChange={toggle('raw_images')}
            />
          </div>

          <div className="flex items-start justify-between gap-3">
            <Label htmlFor="sharing" className="text-sm leading-snug cursor-pointer">
              Allow sharing my results
            </Label>
            <Switch
              id="sharing"
              checked={scopes.sharing}
              onCheckedChange={toggle('sharing')}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          FaceBlame is a fun visual resemblance tool — not a genetic, paternity, or ancestry test.
          It must not be used for any legal, medical, or identity purpose. You must be 18 or older.
          You can revoke consent and delete your data at any time in Settings.
        </p>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <button
          className="btn-gradient w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50"
          onClick={handleGrant}
          disabled={saving}
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          Agree and continue
        </button>
      </motion.div>
    </div>
  );
}

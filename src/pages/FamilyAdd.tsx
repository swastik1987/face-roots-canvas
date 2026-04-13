import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload } from 'lucide-react';

const spring = { type: 'spring' as const, stiffness: 260, damping: 20 };
const relations = ['Mother', 'Father', 'Grandmother', 'Grandfather', 'Sibling', 'Uncle', 'Aunt', 'Other'];

const FamilyAdd = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <motion.div
        className="glass-card p-8 w-full max-w-sm space-y-6"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring}
      >
        <h1 className="text-2xl font-bold text-center">Add family member</h1>

        <button
          className="w-full h-40 rounded-xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition-colors"
          onClick={() => console.log('TODO: upload')}
        >
          <Upload size={28} className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Tap to upload a photo</span>
        </button>

        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="e.g. Maria" className="bg-white/5 border-white/10" />
        </div>

        <div className="space-y-2">
          <Label>Relationship</Label>
          <Select>
            <SelectTrigger className="bg-white/5 border-white/10">
              <SelectValue placeholder="Select relationship" />
            </SelectTrigger>
            <SelectContent>
              {relations.map(r => (
                <SelectItem key={r} value={r.toLowerCase()}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <button
          className="btn-gradient w-full py-3"
          onClick={() => { console.log('TODO: save family member'); navigate('/home'); }}
        >
          Save
        </button>
      </motion.div>
    </div>
  );
};

export default FamilyAdd;

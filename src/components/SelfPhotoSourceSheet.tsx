/**
 * SelfPhotoSourceSheet — choose between guided capture or photo upload
 * when adding/replacing the user's own portrait.
 */

import { useNavigate } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Camera, Upload } from 'lucide-react';

interface SelfPhotoSourceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, /family/add will replace this person row instead of inserting. */
  replacePersonId?: string;
}

export default function SelfPhotoSourceSheet({
  open,
  onOpenChange,
  replacePersonId,
}: SelfPhotoSourceSheetProps) {
  const navigate = useNavigate();

  const goCapture = () => {
    onOpenChange(false);
    navigate('/capture');
  };

  const goUpload = () => {
    onOpenChange(false);
    const params = new URLSearchParams({ self: '1' });
    if (replacePersonId) params.set('person_id', replacePersonId);
    navigate(`/family/add?${params.toString()}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">Add your photo</SheetTitle>
          <SheetDescription className="text-xs">
            Take a guided portrait or upload one from your device.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2 mt-4">
          <button
            onClick={goCapture}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-white/5 transition-colors text-left"
          >
            <Camera size={18} className="text-cyan shrink-0" />
            <div>
              <p className="text-sm font-medium">Take a photo</p>
              <p className="text-xs text-muted-foreground">Guided capture with face alignment</p>
            </div>
          </button>

          <button
            onClick={goUpload}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-white/5 transition-colors text-left"
          >
            <Upload size={18} className="text-cyan shrink-0" />
            <div>
              <p className="text-sm font-medium">Upload a photo</p>
              <p className="text-xs text-muted-foreground">Pick a portrait from your device</p>
            </div>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

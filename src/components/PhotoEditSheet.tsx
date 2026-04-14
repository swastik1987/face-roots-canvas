/**
 * PhotoEditSheet — bottom sheet with options to re-capture/re-upload
 * or edit/crop an existing photo thumbnail.
 */

import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Camera, Upload, CropIcon } from 'lucide-react';
import type { Person } from '@/lib/supabase';

interface PhotoEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: Person;
  /** The current photo signed URL (if any). */
  photoUrl: string | null;
  /** Called when user wants to crop the existing photo. */
  onEditCrop: () => void;
  /** Called when user picks a new file to re-upload (family members only). */
  onReupload?: (file: File) => void;
}

export default function PhotoEditSheet({
  open,
  onOpenChange,
  person,
  photoUrl,
  onEditCrop,
  onReupload,
}: PhotoEditSheetProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSelf = person.is_self;

  const handleRecapture = () => {
    onOpenChange(false);
    navigate('/capture');
  };

  const handleReupload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onReupload) {
      onReupload(file);
      onOpenChange(false);
    }
    e.target.value = '';
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">{person.display_name}</SheetTitle>
          <SheetDescription className="text-xs">
            {isSelf
              ? 'Re-capture your photo or edit the current crop.'
              : 'Re-upload a photo or edit the current crop.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2 mt-4">
          {/* Self: re-capture (full 3-angle flow) */}
          {isSelf && (
            <button
              onClick={handleRecapture}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-white/5 transition-colors text-left"
            >
              <Camera size={18} className="text-cyan shrink-0" />
              <div>
                <p className="text-sm font-medium">Re-capture photo</p>
                <p className="text-xs text-muted-foreground">Take new photos with the guided 3-angle capture</p>
              </div>
            </button>
          )}

          {/* Family: re-upload */}
          {!isSelf && (
            <button
              onClick={handleReupload}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-white/5 transition-colors text-left"
            >
              <Upload size={18} className="text-cyan shrink-0" />
              <div>
                <p className="text-sm font-medium">Upload new photo</p>
                <p className="text-xs text-muted-foreground">Replace with a different photo</p>
              </div>
            </button>
          )}

          {/* Edit / Crop — available for both, but only if a photo exists */}
          {photoUrl && (
            <button
              onClick={() => {
                onOpenChange(false);
                // Small delay so sheet closes before dialog opens
                setTimeout(onEditCrop, 200);
              }}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-white/5 transition-colors text-left"
            >
              <CropIcon size={18} className="text-cyan shrink-0" />
              <div>
                <p className="text-sm font-medium">Edit crop</p>
                <p className="text-xs text-muted-foreground">Adjust which part of the face is used</p>
              </div>
            </button>
          )}
        </div>

        {/* Hidden file input for re-upload */}
        {!isSelf && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

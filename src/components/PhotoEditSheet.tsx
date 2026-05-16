/**
 * PhotoEditSheet — bottom sheet with options to re-capture/re-upload
 * or edit/crop an existing photo thumbnail.
 */

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Camera, Upload, CropIcon, Trash2 } from 'lucide-react';
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
  /** Called when user confirms they want to delete this member. */
  onDelete?: () => void;
}

export default function PhotoEditSheet({
  open,
  onOpenChange,
  person,
  photoUrl,
  onEditCrop,
  onReupload,
  onDelete,
}: PhotoEditSheetProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSelf = person.is_self;
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset confirm state when sheet closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) setConfirmDelete(false);
    onOpenChange(isOpen);
  };

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
    <Sheet open={open} onOpenChange={handleOpenChange}>
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

          {/* Upload new photo — available for both self & family */}
          <button
            onClick={handleReupload}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-white/5 transition-colors text-left"
          >
            <Upload size={18} className="text-cyan shrink-0" />
            <div>
              <p className="text-sm font-medium">Upload new photo</p>
              <p className="text-xs text-muted-foreground">
                {isSelf ? "Pick a portrait from your device" : "Replace with a different photo"}
              </p>
            </div>
          </button>

          {/* Edit / Crop — available for both, but only if a photo exists */}
          {photoUrl && (
            <button
              onClick={() => {
                handleOpenChange(false);
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

          {/* Delete member */}
          {onDelete && (
            <>
              <div className="border-t border-white/10 my-1" />
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-red-500/10 transition-colors text-left"
                >
                  <Trash2 size={18} className="text-red-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-400">Delete member</p>
                    <p className="text-xs text-muted-foreground">Remove {person.display_name} and all their photos</p>
                  </div>
                </button>
              ) : (
                <div className="flex flex-col gap-2 px-4 py-3 rounded-xl bg-red-500/10">
                  <p className="text-sm text-red-400 font-medium">
                    Delete {person.display_name}? This can't be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onDelete();
                        handleOpenChange(false);
                      }}
                      className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
                    >
                      Yes, delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 px-4 py-2 rounded-lg bg-white/10 text-sm font-medium hover:bg-white/15 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Hidden file input for re-upload (both self and family) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </SheetContent>
    </Sheet>
  );
}

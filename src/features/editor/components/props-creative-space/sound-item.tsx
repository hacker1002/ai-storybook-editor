// sound-item.tsx - Single sound item with header (actions) and audio player or empty message

import { useRef, useState } from 'react';
import { Pencil, Music, Upload, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { uploadAudioToStorage } from '@/apis/storage-api';
import { useSnapshotActions } from '@/stores/snapshot-store';
import type { PropSound } from '@/types/prop-types';
import { AudioPlayer } from './audio-player';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SoundItem');

interface SoundItemProps {
  propKey: string;
  sound: PropSound;
  onBrowse: () => void;
}

export function SoundItem({ propKey, sound, onBrowse }: SoundItemProps) {
  const { updatePropSound, deletePropSound } = useSnapshotActions();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(sound.name);
  const [isUploading, setIsUploading] = useState(false);

  const handleStartRename = () => {
    setRenameValue(sound.name);
    setIsRenaming(true);
    log.debug('handleStartRename', 'start', { soundKey: sound.key });
  };

  const handleFinishRename = (accept: boolean) => {
    if (accept && renameValue.trim() && renameValue.trim() !== sound.name) {
      log.info('handleFinishRename', 'renamed', { soundKey: sound.key, newName: renameValue.trim() });
      updatePropSound(propKey, sound.key, { name: renameValue.trim() });
    }
    setIsRenaming(false);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsUploading(true);
    log.info('handleUpload', 'start', { soundKey: sound.key, fileName: file.name, size: file.size });

    try {
      const { publicUrl } = await uploadAudioToStorage(file, `props/${propKey}/sounds`);
      log.info('handleUpload', 'success', { publicUrl });
      updatePropSound(propKey, sound.key, { media_url: publicUrl });
      toast.success('Audio uploaded');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      log.error('handleUpload', 'failed', { error: msg });
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = () => {
    log.info('handleDelete', 'delete sound', { propKey, soundKey: sound.key });
    deletePropSound(propKey, sound.key);
  };

  return (
    <div className="rounded-md border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Name + key */}
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <div className="flex items-center gap-1">
              <Input
                className="h-7 text-sm flex-1"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFinishRename(true);
                  if (e.key === 'Escape') handleFinishRename(false);
                }}
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => handleFinishRename(true)}
                aria-label="Accept rename"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => handleFinishRename(false)}
                aria-label="Cancel rename"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm truncate">{sound.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0"
                  onClick={handleStartRename}
                  title="Rename sound"
                >
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">/{sound.key}</span>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Browse sound library */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={onBrowse}
            aria-label="Browse sound library"
          >
            <Music className="h-3 w-3" />
            Browse
          </Button>

          {/* Upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/aac"
            onChange={handleFileSelected}
            className="hidden"
          />
          <Button
            variant="default"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={handleUploadClick}
            disabled={isUploading}
          >
            <Upload className="h-3 w-3" />
            {isUploading ? 'Uploading...' : 'Upload'}
          </Button>

          {/* Delete */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                title="Delete sound"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Sound</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &ldquo;{sound.name}&rdquo;? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleDelete}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Audio Player or Empty state */}
      <div className="px-3 pb-3">
        {sound.media_url ? (
          <AudioPlayer src={sound.media_url} />
        ) : (
          <div className="flex items-center justify-center h-10 rounded-md bg-muted/50 text-sm text-muted-foreground">
            No audio available, please upload.
          </div>
        )}
      </div>
    </div>
  );
}

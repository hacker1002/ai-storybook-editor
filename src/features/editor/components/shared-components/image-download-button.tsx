// image-download-button.tsx — floating "download this image" button for hover overlays.
// Delegates to downloadImage() (fetch → blob → anchor click), which works cross-origin
// (e.g. Supabase storage public URLs) unlike a bare <a download>. Encapsulates the in-flight
// guard, error toast, and click stopPropagation so the button can sit inside a selectable
// cell without also toggling its selection. Callers position it via `className`.

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { downloadImage } from '@/utils/download-image';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'ImageDownloadButton');

interface ImageDownloadButtonProps {
  /** Image URL to download. */
  url: string;
  /** Filename stem (extension resolved from the blob MIME); defaults to `image`. */
  filename?: string;
  /** Positioning/visibility classes from the caller (e.g. absolute + group-hover reveal). */
  className?: string;
  /** Accessible label + tooltip. */
  label?: string;
}

export function ImageDownloadButton({
  url,
  filename,
  className,
  label = 'Download image',
}: ImageDownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloading) return;
    log.info('handleClick', 'download image', { filename });
    setDownloading(true);
    try {
      await downloadImage(url, filename);
    } catch (err) {
      log.error('handleClick', 'download failed', { filename, error: String(err) });
      toast.error('Failed to download image');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      onClick={handleClick}
      disabled={downloading}
      aria-label={label}
      title={label}
      className={cn('h-8 w-8 shadow-md', className)}
    >
      {downloading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}

export default ImageDownloadButton;

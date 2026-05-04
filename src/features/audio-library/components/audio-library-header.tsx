import { Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/utils/logger';

const log = createLogger('AudioLibrary', 'AudioLibraryHeader');

export interface AudioLibraryHeaderProps {
  title: string;
  titleId: string;
  onOpenUpload: () => void;
  onOpenGenerate: () => void;
}

export function AudioLibraryHeader({
  title,
  titleId,
  onOpenUpload,
  onOpenGenerate,
}: AudioLibraryHeaderProps) {
  const handleUploadClick = () => {
    log.info('onOpenUpload', 'open upload modal');
    onOpenUpload();
  };
  const handleGenerateClick = () => {
    log.info('onOpenGenerate', 'open generate modal');
    onOpenGenerate();
  };

  return (
    <header className="flex items-center justify-between py-4 px-6">
      <h1 id={titleId} className="text-2xl font-semibold">
        {title}
      </h1>
      <div className="flex gap-2">
        <Button variant="outline" className="gap-2" onClick={handleUploadClick}>
          <Upload className="h-4 w-4" />
          Upload
        </Button>
        <Button variant="default" className="gap-2" onClick={handleGenerateClick}>
          <Sparkles className="h-4 w-4" />
          Generate
        </Button>
      </div>
    </header>
  );
}

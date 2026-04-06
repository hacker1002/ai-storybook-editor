// share-passcode-form.tsx - Passcode entry form for private share links
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createLogger } from '@/utils/logger';

const log = createLogger('SharePreview', 'SharePasscodeForm');

interface SharePasscodeFormProps {
  linkName: string;
  isVerifying: boolean;
  error: string | null;
  onSubmit: (passcode: string) => void;
}

export function SharePasscodeForm({ linkName, isVerifying, error, onSubmit }: SharePasscodeFormProps) {
  const [passcode, setPasscode] = useState('');

  const handleSubmit = () => {
    if (passcode.trim() === '') return;
    log.info('handleSubmit', 'submitting passcode');
    onSubmit(passcode);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className="flex flex-col items-center max-w-sm mx-auto mt-[20vh] gap-4 px-4">
      <Lock className="h-6 w-6 text-muted-foreground" aria-hidden="true" />

      <p className="text-lg font-medium text-center">{linkName}</p>

      <Input
        type="password"
        placeholder="Nhập mã truy cập"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isVerifying}
        autoFocus
        aria-label="Mã truy cập"
        aria-invalid={!!error}
        className="w-full"
      />

      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="text-sm text-destructive text-center w-full"
        >
          {error}
        </p>
      )}

      <Button
        onClick={handleSubmit}
        disabled={isVerifying || passcode.trim() === ''}
        aria-label="Xác nhận mã truy cập"
        className="w-full"
      >
        {isVerifying ? 'Đang xác nhận...' : 'Xác nhận'}
      </Button>
    </div>
  );
}

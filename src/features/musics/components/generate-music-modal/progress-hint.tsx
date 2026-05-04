import { useEffect, useState } from 'react';

export interface ProgressHintProps {
  visibleAfterMs?: number;
  message: string;
}

export function ProgressHint({ visibleAfterMs = 30000, message }: ProgressHintProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), visibleAfterMs);
    return () => window.clearTimeout(t);
  }, [visibleAfterMs]);

  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="text-xs text-muted-foreground mt-3"
    >
      {message}
    </div>
  );
}

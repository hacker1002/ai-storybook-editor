// sketch-degraded-banner.tsx — inline banner for a DEGRADED sketch resource (ADR-047 phase-04).
// Never-hide-disabled-UI: the space stays browsable, but the user must see WHY saving is refused
// and have a way back into the consent modal ("Xem lại lựa chọn" clears the session dismissals,
// which re-opens the app-root SketchNormalizeConsentHost).

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSketchConsentStore } from '@/stores/sketch-consent-store';

interface SketchDegradedBannerProps {
  /** Override the default sheet-scoped message (e.g. entity-scoped copy). */
  message?: string;
}

export function SketchDegradedBanner({ message }: SketchDegradedBannerProps) {
  const reopen = useSketchConsentStore((s) => s.reopen);
  return (
    <div
      role="alert"
      className="flex shrink-0 items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2"
    >
      <span className="flex min-w-0 items-center gap-2 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          {message ?? 'Dữ liệu sheet này không đọc được — chỉ xem. Không thể lưu thay đổi.'}
        </span>
      </span>
      <Button size="sm" variant="outline" className="shrink-0" onClick={reopen}>
        Xem lại lựa chọn
      </Button>
    </div>
  );
}

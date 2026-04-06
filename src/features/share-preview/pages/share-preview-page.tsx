// share-preview-page.tsx - Public share preview page (/share/:slug). No auth required.
// State machine: loading → requires_passcode | ready | not_found | error
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { fetchSharePreview } from '@/apis/share-api';
import type { BookPreviewData, ShareConfig, SharePreviewStatus, SnapshotPreviewData } from '@/types/share-preview-types';
import { SharePasscodeForm } from '../components/share-passcode-form';
import { SharePreviewViewer } from '../components/share-preview-viewer';
import { createLogger } from '@/utils/logger';

const log = createLogger('SharePreview', 'SharePreviewPage');

// === State ===

interface PageState {
  status: SharePreviewStatus;
  error: string | null;
  isVerifying: boolean;
  shareConfig: ShareConfig | null;
  book: BookPreviewData | null;
  snapshot: SnapshotPreviewData | null;
  linkName: string;
}

const initialState: PageState = {
  status: 'loading',
  error: null,
  isVerifying: false,
  shareConfig: null,
  book: null,
  snapshot: null,
  linkName: '',
};

// === sessionStorage helpers (guarded against SecurityError in restricted contexts) ===

function getCachedPasscode(slug: string): string | null {
  try {
    return sessionStorage.getItem(`share_passcode_${slug}`);
  } catch {
    return null;
  }
}

function setCachedPasscode(slug: string, passcode: string) {
  try {
    sessionStorage.setItem(`share_passcode_${slug}`, passcode);
  } catch {
    // sessionStorage unavailable — continue without caching
  }
}

function removeCachedPasscode(slug: string) {
  try {
    sessionStorage.removeItem(`share_passcode_${slug}`);
  } catch {
    // ignore
  }
}

// === Component ===

export function SharePreviewPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [state, setState] = useState<PageState>(initialState);
  // Prevents the secondary useEffect from re-auto-submitting after the initial mount auto-submit
  const autoSubmittedRef = useRef(false);

  const loadPreview = useCallback(async (passcode?: string) => {
    log.info('loadPreview', 'fetching', { slug, hasPasscode: !!passcode });
    const result = await fetchSharePreview(slug, passcode);

    if (result.status === 'requires_passcode') {
      log.debug('loadPreview', 'passcode required', { name: result.name });
      setState((s) => ({
        ...s,
        status: 'requires_passcode',
        linkName: result.name,
        error: null,
        isVerifying: false,
      }));
      return;
    }

    if (result.status === 'ready') {
      log.info('loadPreview', 'ready', { bookId: result.book.id });
      setState((s) => ({
        ...s,
        status: 'ready',
        shareConfig: result.shareConfig,
        book: result.book,
        snapshot: result.snapshot,
        error: null,
        isVerifying: false,
      }));
      return;
    }

    if (result.status === 'not_found') {
      log.debug('loadPreview', 'not found');
      setState((s) => ({ ...s, status: 'not_found', isVerifying: false }));
      return;
    }

    if (result.status === 'invalid_passcode') {
      log.debug('loadPreview', 'invalid cached passcode — evicting');
      removeCachedPasscode(slug); // stale cached passcode → remove to prevent infinite loop
      setState((s) => ({
        ...s,
        status: 'requires_passcode',
        error: 'Sai mã truy cập',
        isVerifying: false,
      }));
      return;
    }

    if (result.status === 'rate_limited') {
      log.warn('loadPreview', 'rate limited');
      setState((s) => ({
        ...s,
        status: 'requires_passcode',
        error: 'Quá nhiều lần thử, vui lòng thử lại sau 15 phút',
        isVerifying: false,
      }));
      return;
    }

    // error
    log.error('loadPreview', 'error', { message: result.message });
    setState((s) => ({
      ...s,
      status: 'error',
      error: result.message,
      isVerifying: false,
    }));
  }, [slug]);

  // Initial load — try cached passcode first
  useEffect(() => {
    if (!slug) return;

    const cached = getCachedPasscode(slug);
    if (cached) {
      log.debug('useEffect:init', 'found cached passcode, auto-submitting');
      autoSubmittedRef.current = true;
      loadPreview(cached);
    } else {
      loadPreview();
    }
  }, [slug, loadPreview]);

  // Auto-submit cached passcode if status transitions to requires_passcode after mount
  // (only runs if we did NOT already auto-submit on mount)
  useEffect(() => {
    if (state.status !== 'requires_passcode') return;
    if (autoSubmittedRef.current) {
      // Mount auto-submit already fired — clear flag, do not re-submit
      autoSubmittedRef.current = false;
      return;
    }
    const cached = getCachedPasscode(slug);
    if (cached) {
      log.debug('useEffect:requires_passcode', 'auto-submitting cached passcode');
      autoSubmittedRef.current = true;
      setState((s) => ({ ...s, isVerifying: true }));
      loadPreview(cached);
    }
  }, [state.status, slug, loadPreview]);

  const handlePasscodeSubmit = useCallback(async (passcode: string) => {
    log.info('handlePasscodeSubmit', 'verifying passcode');
    setState((s) => ({ ...s, isVerifying: true, error: null }));

    const result = await fetchSharePreview(slug, passcode);

    if (result.status === 'ready') {
      setCachedPasscode(slug, passcode);
      setState((s) => ({
        ...s,
        status: 'ready',
        shareConfig: result.shareConfig,
        book: result.book,
        snapshot: result.snapshot,
        error: null,
        isVerifying: false,
      }));
      return;
    }

    if (result.status === 'invalid_passcode') {
      removeCachedPasscode(slug);
      setState((s) => ({ ...s, error: 'Sai mã truy cập', isVerifying: false }));
      return;
    }

    if (result.status === 'rate_limited') {
      setState((s) => ({
        ...s,
        error: 'Quá nhiều lần thử, vui lòng thử lại sau 15 phút',
        isVerifying: false,
      }));
      return;
    }

    if (result.status === 'requires_passcode') {
      // Unexpected: server still requires passcode even though we sent one
      setState((s) => ({ ...s, isVerifying: false }));
      return;
    }

    if (result.status === 'not_found') {
      setState((s) => ({ ...s, status: 'not_found', isVerifying: false }));
      return;
    }

    if (result.status === 'error') {
      setState((s) => ({ ...s, error: result.message, isVerifying: false }));
    }
  }, [slug]);

  const handleRetry = useCallback(() => {
    setState(initialState);
    loadPreview();
  }, [loadPreview]);

  log.debug('render', 'status', { status: state.status });

  // === Render switch ===

  if (state.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (state.status === 'requires_passcode') {
    return (
      <div className="h-screen bg-background">
        <SharePasscodeForm
          linkName={state.linkName}
          isVerifying={state.isVerifying}
          error={state.error}
          onSubmit={handlePasscodeSubmit}
        />
      </div>
    );
  }

  if (state.status === 'ready' && state.book && state.shareConfig) {
    return (
      <div className="h-screen">
        <SharePreviewViewer
          book={state.book}
          snapshot={state.snapshot}
          shareConfig={state.shareConfig}
        />
      </div>
    );
  }

  if (state.status === 'not_found') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-2xl font-semibold mb-2">404</p>
          <p className="text-sm">Không tìm thấy trang chia sẻ này.</p>
        </div>
      </div>
    );
  }

  // error state
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <p className="text-base font-medium">Đã có lỗi xảy ra</p>
        {state.error && <p className="text-sm">{state.error}</p>}
        <Button variant="outline" size="sm" onClick={handleRetry}>
          Thử lại
        </Button>
      </div>
    </div>
  );
}

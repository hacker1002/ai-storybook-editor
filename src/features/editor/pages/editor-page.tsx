import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditorSettingsActions, useEditorSettingsStore } from '@/stores/editor-settings-store';
import {
  useSnapshotActions,
  useSyncState,
  useSnapshotFetchLoading,
  useSnapshotFetchError,
  deriveSaveStatus,
} from '@/stores/snapshot-store';
import { useBookStore, useCurrentBook, useBooksLoading, useBooksError } from '@/stores/book-store';
import { useArtStyleStore } from '@/stores/art-style-store';
import { getDefaultCreativeSpace, AVAILABLE_LANGUAGES } from '@/constants/editor-constants';
import { PIPELINE_STEP_MAP } from '@/constants/book-enums';
import { EditorHeader } from '../components/editor-header';
import { IconRail } from '../components/icon-rail';
import { ObjectsCreativeSpace } from '../components/objects-creative-space';
import { PreviewCreativeSpace } from '../components/preview-creative-space';
import { PropsCreativeSpace } from '../components/props-creative-space';
import { StagesCreativeSpace } from '../components/stages-creative-space';
import { CharactersCreativeSpace } from '../components/characters-creative-space';
import { SketchVariantsCreativeSpace, SPACE_TO_KIND } from '../components/sketch-variants-creative-space';
import { SketchSpreadsCreativeSpace } from '../components/sketch-spreads-creative-space';
import { SpreadsCreativeSpace } from '../components/spreads-creative-space';
import { BranchCreativeSpace } from '../components/branch-creative-space';
import { HistoryCreativeSpace } from '../components/history-creative-space';
import { MockCreativeSpace } from '../components/creative-space-mocks/mock-creative-space';
import { SharesCreativeSpace } from '../components/shares-creative-space';
import { ConfigCreativeSpace } from '../components/config-creative-space';
import { RemixCreativeSpace } from '../components/remix-creative-space';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InteractionLayerProvider } from '../contexts';
import type { CreativeSpaceType, PipelineStep, Language } from '@/types/editor';
import { createLogger } from '@/utils/logger';
import { useImageTaskNotifications } from '../hooks/use-image-task-notifications';
import { useAutoSave } from '../hooks/use-auto-save';
import { useFlushOnHidden } from '../hooks/use-flush-on-hidden';

const log = createLogger('Editor', 'EditorPage');

const MOCK_USER_POINTS = { current: 750, total: 1000 };

export function EditorPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();

  // Book store
  const { fetchBook } = useBookStore();
  const book = useCurrentBook();
  const bookLoading = useBooksLoading();
  const bookError = useBooksError();

  // Snapshot store
  const { fetchSnapshot, resetSnapshot, autoSaveSnapshot } = useSnapshotActions();
  const sync = useSyncState();
  const snapshotLoading = useSnapshotFetchLoading();
  const snapshotError = useSnapshotFetchError();

  // Register auto-save timer — must be called exactly once
  useAutoSave();
  // Flush on page hidden (tab switch / minimize / reload / close)
  useFlushOnHidden();

  // Editor settings
  const { setCurrentStep, resetSettings, rememberLanguageForBook, rememberStepForBook } =
    useEditorSettingsActions();

  // Global toast notifications for background image tasks (ADR-017 client queue —
  // distinct from background_jobs). Remix/export/render/transcode job toasts now
  // live in the app-root useJobNotifications() (ADR-037).
  useImageTaskNotifications();

  // Local UI state
  const [activeCreativeSpace, setActiveCreativeSpace] = useState<CreativeSpaceType>('sketch-character');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notificationCount] = useState(3);

  // Fetch book and snapshot on mount
  useEffect(() => {
    if (!bookId) {
      navigate('/');
      return;
    }

    const loadData = async () => {
      const fetchedBook = await fetchBook(bookId);
      if (fetchedBook) {
        const store = useEditorSettingsStore.getState();
        const persistedLangCode = store.getPersistedLanguageForBook(bookId);
        const persistedLang = persistedLangCode
          ? AVAILABLE_LANGUAGES.find((l) => l.code === persistedLangCode)
          : undefined;
        const fallbackLang =
          AVAILABLE_LANGUAGES.find((l) => l.code === fetchedBook.original_language) ??
          AVAILABLE_LANGUAGES[0];
        const initialLang = persistedLang ?? fallbackLang;

        const persistedStep = store.getPersistedStepForBook(bookId);
        const backendStep = (PIPELINE_STEP_MAP[fetchedBook.step as keyof typeof PIPELINE_STEP_MAP] ??
          'sketch') as PipelineStep;
        const initialStep = persistedStep ?? backendStep;

        log.info('loadData', 'hydrate', {
          bookId,
          lang: { persisted: persistedLangCode, picked: initialLang.code },
          step: { persisted: persistedStep, picked: initialStep },
        });

        // bleedMm: print_export.bleed not yet in type — default 3mm per ADR-023
        resetSettings(initialLang, initialStep, fetchedBook.dimension ?? null, 3);
        setActiveCreativeSpace(getDefaultCreativeSpace(initialStep) as CreativeSpaceType);

        // Fetch snapshot for this book
        await fetchSnapshot(bookId);

        // Fetch art style description for illustration APIs
        if (fetchedBook.artstyle_id) {
          useArtStyleStore.getState().fetchArtStyle(fetchedBook.artstyle_id);
        }
      }
    };

    loadData();

    // Cleanup on unmount
    return () => {
      resetSnapshot();
      useArtStyleStore.getState().reset();
    };
  }, [bookId, fetchBook, fetchSnapshot, resetSnapshot, resetSettings, navigate]);

  // Remember step choice per book
  const handleStepChangePersist = (targetStep: PipelineStep) => {
    if (bookId) rememberStepForBook(bookId, targetStep);
  };

  // Loading state
  const isLoading = bookLoading || snapshotLoading;
  const error = bookError || snapshotError;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading editor...</p>
        </div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">{error || 'Book not found'}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 text-primary hover:underline"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  // Derived save status
  const saveStatus = deriveSaveStatus(sync);

  // Handlers
  // Flush dirty snapshot before navigating away. Fire-and-forget: never block
  // UI navigation on the network round-trip. autoSaveSnapshot() self-guards on
  // !isDirty / isSaving (snapshot-store/index.ts), so redundant calls no-op.
  const handleCreativeSpaceChange = (target: CreativeSpaceType) => {
    // 'history' owns its own awaited save-then-load (history-creative-space.tsx);
    // a fire-and-forget save here would flip isSaving and defeat that await → stale list.
    if (target !== 'history' && target !== activeCreativeSpace) {
      log.debug('handleCreativeSpaceChange', 'flush before switch', { from: activeCreativeSpace, to: target });
      autoSaveSnapshot();
    }
    setActiveCreativeSpace(target);
  };

  const handleStepChange = (targetStep: PipelineStep) => {
    log.debug('handleStepChange', 'flush before step switch', { to: targetStep });
    autoSaveSnapshot();
    setCurrentStep(targetStep);
    setActiveCreativeSpace(getDefaultCreativeSpace(targetStep) as CreativeSpaceType);
    handleStepChangePersist(targetStep);
  };

  const handleLanguageChange = (newLang: Language, prevLang: Language) => {
    log.info('handleLanguageChange', 'changed', { from: prevLang.code, to: newLang.code });
    if (bookId) rememberLanguageForBook(bookId, newLang.code);
  };

  const handleTitleEdit = async (newTitle: string) => {
    if (!bookId) return;
    await useBookStore.getState().updateBook(bookId, { title: newTitle });
  };

  const handleNavigateHome = () => {
    navigate('/');
  };

  const handleNotificationClick = () => {
    log.info('handleNotificationClick', 'opened');
  };

  // Render creative space based on activeCreativeSpace
  const renderCreativeSpace = () => {
    switch (activeCreativeSpace) {
      case 'object':
        return <ObjectsCreativeSpace />;
      case 'prop':
        return <PropsCreativeSpace />;
      case 'stage':
        return <StagesCreativeSpace />;
      case 'character':
        return <CharactersCreativeSpace />;
      case 'spread':
        return <SpreadsCreativeSpace />;
      case 'branch':
        return <BranchCreativeSpace />;
      case 'preview':
        return <PreviewCreativeSpace />;
      case 'setting':
        return <ConfigCreativeSpace />;
      case 'history':
        return <HistoryCreativeSpace />;
      case 'share':
        return <SharesCreativeSpace />;
      case 'remix':
        return <RemixCreativeSpace />;
      // Sketch entity spaces (characters/props/stages) — one shared component keyed by kind.
      // Switch narrows activeCreativeSpace to SketchEntitySpaceId here, so the index is typesafe.
      case 'sketch-character':
      case 'sketch-prop':
      case 'sketch-stage':
        return <SketchVariantsCreativeSpace kind={SPACE_TO_KIND[activeCreativeSpace]} />;
      // sketch-spread (storyboard) — standalone space (not a `kind` of the entity space).
      case 'sketch-spread':
        return <SketchSpreadsCreativeSpace />;
      case 'quiz':
      case 'issue':
      case 'collaborator':
        return <MockCreativeSpace name={activeCreativeSpace} />;
      default:
        return <MockCreativeSpace name="Unknown" />;
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <InteractionLayerProvider>
      <div className="flex h-screen w-screen max-w-full flex-col overflow-hidden">
        {/* Header */}
        <EditorHeader
          bookTitle={book.title}
          saveStatus={saveStatus}
          notificationCount={notificationCount}
          userPoints={MOCK_USER_POINTS}
          editorMode={book.type === 1 ? 'book' : 'asset'}
          onTitleEdit={handleTitleEdit}
          onNotificationClick={handleNotificationClick}
          onNavigateHome={handleNavigateHome}
          onStepChange={handleStepChange}
          onLanguageChange={handleLanguageChange}
        />

        {/* Main Content */}
        <div className="flex flex-1 min-w-0 overflow-hidden">
          {/* Icon Rail */}
          <IconRail
            activeCreativeSpace={activeCreativeSpace}
            onCreativeSpaceChange={handleCreativeSpaceChange}
          />

          {/* Creative Space */}
          <div className="flex-1 min-w-0 overflow-hidden">{renderCreativeSpace()}</div>

          {/* Right Sidebar (AI) - Mock */}
          {isSidebarOpen && (
            <aside className="w-80 border-l bg-background p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">AI Assistant</h3>
                <button onClick={() => setIsSidebarOpen(false)}>×</button>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">Coming soon...</p>
            </aside>
          )}
        </div>

        {/* AI Toggle Button (when sidebar closed) */}
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
          >
            💬
          </button>
        )}
      </div>
      </InteractionLayerProvider>
    </TooltipProvider>
  );
}

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditorSettingsActions } from '@/stores/editor-settings-store';
import {
  useSnapshotActions,
  useIsDirty,
  useIsSaving,
  useSnapshotFetchLoading,
  useSnapshotFetchError,
} from '@/stores/snapshot-store';
import { useBookStore, useCurrentBook, useBooksLoading, useBooksError } from '@/stores/book-store';
import { useArtStyleStore } from '@/stores/art-style-store';
import { getDefaultCreativeSpace, AVAILABLE_LANGUAGES } from '@/constants/editor-constants';
import { PIPELINE_STEP_MAP } from '@/constants/book-enums';
import { EditorHeader } from '../components/editor-header';
import { IconRail } from '../components/icon-rail';
import { DocCreativeSpace } from '../components/doc-creative-space';
import { DummyCreativeSpace } from '../components/dummy-creative-space';
import { ObjectsCreativeSpace } from '../components/objects-creative-space';
import { AnimationsCreativeSpace } from '../components/animations-creative-space';
import { PreviewCreativeSpace } from '../components/preview-creative-space';
import { PropsCreativeSpace } from '../components/props-creative-space';
import { StagesCreativeSpace } from '../components/stages-creative-space';
import { CharactersCreativeSpace } from '../components/characters-creative-space';
import { SpreadsCreativeSpace } from '../components/spreads-creative-space';
import { BranchCreativeSpace } from '../components/branch-creative-space';
import { MockCreativeSpace } from '../components/creative-space-mocks/mock-creative-space';
import { ConfigCreativeSpace } from '../components/config-creative-space';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { CreativeSpaceType, PipelineStep, Language, SaveStatus } from '@/types/editor';
import { createLogger } from '@/utils/logger';
import { useImageTaskNotifications } from '../hooks/use-image-task-notifications';

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
  const { fetchSnapshot, resetSnapshot, saveSnapshot } = useSnapshotActions();
  const isDirty = useIsDirty();
  const isSaving = useIsSaving();
  const snapshotLoading = useSnapshotFetchLoading();
  const snapshotError = useSnapshotFetchError();

  // Editor settings
  const { setCurrentStep, resetSettings } = useEditorSettingsActions();

  // Global toast notifications for background image tasks
  useImageTaskNotifications();

  // Local UI state
  const [activeCreativeSpace, setActiveCreativeSpace] = useState<CreativeSpaceType>('doc');
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
        // Initialize editor settings based on book
        const initialLang =
          AVAILABLE_LANGUAGES.find((l) => l.code === fetchedBook.original_language) ??
          AVAILABLE_LANGUAGES[0];
        const initialStep = (PIPELINE_STEP_MAP[fetchedBook.step as keyof typeof PIPELINE_STEP_MAP] ??
          'manuscript') as PipelineStep;
        resetSettings(initialLang, initialStep);
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
  const saveStatus: SaveStatus = isSaving ? 'saving' : isDirty ? 'unsaved' : 'saved';

  // Handlers
  const handleStepChange = (targetStep: PipelineStep) => {
    setCurrentStep(targetStep);
    setActiveCreativeSpace(getDefaultCreativeSpace(targetStep) as CreativeSpaceType);
  };

  const handleLanguageChange = (newLang: Language, prevLang: Language) => {
    log.info('handleLanguageChange', 'changed', { from: prevLang.code, to: newLang.code });
  };

  const handleTitleEdit = async (newTitle: string) => {
    if (!bookId) return;
    await useBookStore.getState().updateBook(bookId, { title: newTitle });
  };

  const handleSave = async () => {
    await saveSnapshot();
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
      case 'doc':
        return <DocCreativeSpace />;
      case 'dummy':
        return <DummyCreativeSpace />;
      case 'object':
        return <ObjectsCreativeSpace />;
      case 'animation':
        return <AnimationsCreativeSpace onNavigateToPreview={() => setActiveCreativeSpace('preview')} />;
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
      case 'sketch':
      case 'remix':
      case 'history':
      case 'flag':
      case 'share':
      case 'collaborator':
        return <MockCreativeSpace name={activeCreativeSpace} />;
      default:
        return <MockCreativeSpace name="Unknown" />;
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen w-screen max-w-full flex-col overflow-hidden">
        {/* Header */}
        <EditorHeader
          bookTitle={book.title}
          saveStatus={saveStatus}
          notificationCount={notificationCount}
          userPoints={MOCK_USER_POINTS}
          editorMode={book.type === 1 ? 'book' : 'asset'}
          onTitleEdit={handleTitleEdit}
          onSave={handleSave}
          onNotificationClick={handleNotificationClick}
          onNavigateHome={handleNavigateHome}
          onStepChange={handleStepChange}
          onLanguageChange={handleLanguageChange}
        />

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Icon Rail */}
          <IconRail
            activeCreativeSpace={activeCreativeSpace}
            onCreativeSpaceChange={setActiveCreativeSpace}
          />

          {/* Creative Space */}
          <div className="flex-1 overflow-hidden">{renderCreativeSpace()}</div>

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
    </TooltipProvider>
  );
}

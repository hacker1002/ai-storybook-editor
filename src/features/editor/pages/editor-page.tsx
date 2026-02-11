import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditorSettingsActions } from '@/stores/editor-settings-store';
import { useSnapshotActions, useIsDirty, useIsSaving } from '@/stores/snapshot-store';
import { getDefaultCreativeSpace, AVAILABLE_LANGUAGES } from '@/constants/editor-constants';
import { EditorHeader } from '../components/editor-header';
import { IconRail } from '../components/icon-rail';
import { DocCreativeSpace } from '../components/doc-creative-space';
import { MockCreativeSpace } from '../components/creative-space-mocks/mock-creative-space';
import type { CreativeSpaceType, PipelineStep, Language, Book, SaveStatus } from '@/types/editor';

// Mock book data - replace with API call
const MOCK_BOOK: Book = {
  id: '1',
  title: 'The Hidden Valley',
  type: 1,
  original_language: 'en_US',
};

const MOCK_USER_POINTS = { current: 750, total: 1000 };

export function EditorPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const initialized = useRef(false);

  // Stores
  const { setCurrentStep, resetSettings } = useEditorSettingsActions();
  const { initSnapshot } = useSnapshotActions();
  const isDirty = useIsDirty();
  const isSaving = useIsSaving();

  // Local state - initialize synchronously with mock data
  const [book, setBook] = useState<Book>(MOCK_BOOK);
  const [activeCreativeSpace, setActiveCreativeSpace] = useState<CreativeSpaceType>('doc');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notificationCount] = useState(3);

  // Initialize stores on mount (external systems sync)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    initSnapshot({ docs: undefined, meta: { bookId: bookId ?? null } });

    const initialLang =
      AVAILABLE_LANGUAGES.find((l) => l.code === MOCK_BOOK.original_language) ??
      AVAILABLE_LANGUAGES[0];
    resetSettings(initialLang, 'manuscript');
  }, [bookId, initSnapshot, resetSettings]);

  // Derived save status
  const saveStatus: SaveStatus = isSaving ? 'saving' : isDirty ? 'unsaved' : 'saved';

  // Handlers
  const handleStepChange = (targetStep: PipelineStep) => {
    setCurrentStep(targetStep);
    setActiveCreativeSpace(getDefaultCreativeSpace(targetStep) as CreativeSpaceType);
  };

  const handleLanguageChange = (newLang: Language, prevLang: Language) => {
    console.log(`Language changed from ${prevLang.code} to ${newLang.code}`);
  };

  const handleTitleEdit = (newTitle: string) => {
    setBook((prev) => (prev ? { ...prev, title: newTitle } : prev));
  };

  const handleSave = async () => {
    console.log('Saving...');
  };

  const handleNavigateHome = () => {
    navigate('/');
  };

  const handleNotificationClick = () => {
    console.log('Open notifications');
  };

  // Render creative space based on activeCreativeSpace
  const renderCreativeSpace = () => {
    switch (activeCreativeSpace) {
      case 'doc':
        return <DocCreativeSpace />;
      case 'dummy':
      case 'sketch':
      case 'character':
      case 'prop':
      case 'stage':
      case 'spread':
      case 'object':
      case 'animation':
      case 'remix':
      case 'history':
      case 'flag':
      case 'share':
      case 'collaborator':
      case 'setting':
        return <MockCreativeSpace name={activeCreativeSpace} />;
      default:
        return <MockCreativeSpace name="Unknown" />;
    }
  };

  return (
    <div className="flex h-screen flex-col">
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
  );
}

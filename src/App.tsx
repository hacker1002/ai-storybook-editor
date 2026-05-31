import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppLayout } from '@/components/layout/app-layout';
import { HomePage } from '@/features/home';
import { LoginPage } from '@/features/auth';
import { EditorPage } from '@/features/editor';
import { VoicesPage } from '@/features/voices';
import { SoundsPage } from '@/features/sounds';
import { MusicsPage } from '@/features/musics';
import { HumansPage } from '@/features/humans';
import { DemoCanvasSpreadView, DemoPlayableSpreadView, DemoRivePlayer } from '@/features/demo-spread-views';
import { useAuthStore } from '@/stores/auth-store';
import { useVoicesActions } from '@/stores/voices-store';
import { useHumansActions } from '@/stores/humans-store';

const SharePreviewPage = lazy(() =>
  import('@/features/share-preview').then((m) => ({ default: m.SharePreviewPage }))
);

const PrintExportPage = lazy(() =>
  import('@/features/print-export').then((m) => ({ default: m.PrintExportPage }))
);

const HumanDetailPage = lazy(() =>
  import('@/features/humans').then((m) => ({ default: m.HumanDetailPage }))
);

const SIDEBAR_PLACEHOLDER_ROUTES: Array<{ path: string; title: string }> = [
  { path: '/books',      title: 'Books' },
  { path: '/products',   title: 'Products' },
  { path: '/assets',     title: 'Assets' },
  { path: '/concepts',   title: 'Concepts' },
  { path: '/styles',     title: 'Styles' },
  { path: '/categories', title: 'Categories' },
  { path: '/eras',       title: 'Eras' },
  { path: '/locations',  title: 'Locations' },
  { path: '/themes',     title: 'Themes' },
  { path: '/genres',     title: 'Genres' },
  { path: '/formats',    title: 'Formats' },
];

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-2 text-muted-foreground">Coming soon</p>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
        <p className="mt-4 text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export default function App() {
  const { initialize, isInitialized, isAuthenticated } = useAuthStore();
  const { fetchVoices } = useVoicesActions();
  const { fetchHumans } = useHumansActions();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (isInitialized && isAuthenticated) {
      void fetchVoices();
      void fetchHumans();
    }
  }, [isInitialized, isAuthenticated, fetchVoices, fetchHumans]);

  if (!isInitialized) {
    return <LoadingScreen />;
  }

  return (
    <>
      <Toaster position="top-right" richColors closeButton />
      <BrowserRouter>
        <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/editor/:bookId" element={<EditorPage />} />
        <Route path="/share/:slug" element={<Suspense fallback={<LoadingScreen />}><SharePreviewPage /></Suspense>} />
        <Route path="/print/:id" element={<Suspense fallback={<LoadingScreen />}><PrintExportPage /></Suspense>} />
        <Route path="/demo/canvas-spread-view" element={<DemoCanvasSpreadView />} />
        <Route path="/demo/playable-spread-view" element={<DemoPlayableSpreadView />} />
        <Route path="/demo/rive-player" element={<DemoRivePlayer />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/voices" element={<VoicesPage />} />
          <Route path="/sounds" element={<SoundsPage />} />
          <Route path="/musics" element={<MusicsPage />} />
          <Route path="/humans" element={<HumansPage />} />
          <Route
            path="/humans/:id"
            element={<Suspense fallback={<LoadingScreen />}><HumanDetailPage /></Suspense>}
          />
          {SIDEBAR_PLACEHOLDER_ROUTES.map(({ path, title }) => (
            <Route key={path} path={path} element={<PlaceholderPage title={title} />} />
          ))}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

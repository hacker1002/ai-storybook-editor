import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/app-layout'
import { HomePage } from '@/features/home'
import { LoginPage, RegisterPage } from '@/features/auth'

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-2 text-muted-foreground">Coming soon</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/explore" element={<PlaceholderPage title="Explore Community" />} />
          <Route path="/library" element={<PlaceholderPage title="Asset Library" />} />
          <Route path="/assets" element={<PlaceholderPage title="My Assets" />} />
          <Route path="/templates" element={<PlaceholderPage title="Templates" />} />
          <Route path="/learn" element={<PlaceholderPage title="Learn" />} />
          <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

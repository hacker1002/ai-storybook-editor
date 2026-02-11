import { Outlet } from 'react-router-dom'
import { Search, Bell } from 'lucide-react'
import { Sidebar } from './sidebar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function AppLayout() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="flex-1" />
          <div className="w-full max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search stories, templates..."
                className="h-9 w-full rounded-full border-muted bg-muted/50 pl-10 focus-visible:ring-primary"
              />
            </div>
          </div>
          <div className="flex flex-1 justify-end">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto bg-muted/30 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

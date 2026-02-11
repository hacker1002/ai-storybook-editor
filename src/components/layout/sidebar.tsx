import { NavLink } from 'react-router-dom'
import {
  Plus,
  Compass,
  Library,
  FolderOpen,
  LayoutTemplate,
  GraduationCap,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/explore', icon: Compass, label: 'Explore Community' },
  { to: '/library', icon: Library, label: 'Asset Library' },
  { to: '/assets', icon: FolderOpen, label: 'My Assets' },
  { to: '/templates', icon: LayoutTemplate, label: 'Templates' },
  { to: '/learn', icon: GraduationCap, label: 'Learn' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const { user, isAuthenticated } = useAuthStore()

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar-background">
      <div className="p-4">
        <h1 className="text-xl font-bold text-foreground">StoryWeaver</h1>
      </div>

      <div className="px-3 py-2">
        <Button className="w-full gap-2" size="lg">
          <Plus className="h-4 w-4" />
          New Story
        </Button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {isAuthenticated && user ? (
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 truncate">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-t border-sidebar-border p-4">
          <NavLink to="/login">
            <Button variant="outline" className="w-full">
              Sign In
            </Button>
          </NavLink>
        </div>
      )}
    </aside>
  )
}

import { NavLink } from "react-router-dom";
import {
  BookOpen,
  Package,
  Folder,
  Lightbulb,
  Palette,
  Music,
  Mic,
  AudioLines,
  ListTree,
  Clock,
  MapPin,
  Sparkles,
  Drama,
  FileText,
  User,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuthStore } from "@/stores/auth-store";
import { useCurrentProfile } from "@/features/users/hooks/use-current-profile";
import { cn } from "@/utils/utils";

type NavKey =
  | "books"
  | "products"
  | "assets"
  | "concepts"
  | "styles"
  | "sounds"
  | "humans"
  | "voices"
  | "musics"
  | "categories"
  | "eras"
  | "locations"
  | "themes"
  | "genres"
  | "formats"
  | "users";

interface NavItemConfig {
  key: NavKey;
  to: string;
  icon: LucideIcon;
  label: string;
  group: "primary" | "asset-types" | "taxonomy";
  /** Admin-only destination — rendered disabled + tooltip for non-admins. */
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    key: "books",
    to: "/books",
    icon: BookOpen,
    label: "Books",
    group: "primary",
  },
  {
    key: "products",
    to: "/products",
    icon: Package,
    label: "Products",
    group: "primary",
  },
  {
    key: "assets",
    to: "/assets",
    icon: Folder,
    label: "Assets",
    group: "primary",
  },

  {
    key: "concepts",
    to: "/concepts",
    icon: Lightbulb,
    label: "Concepts",
    group: "asset-types",
  },
  {
    key: "styles",
    to: "/styles",
    icon: Palette,
    label: "Styles",
    group: "asset-types",
  },
  {
    key: "humans",
    to: "/humans",
    icon: User,
    label: "Humans",
    group: "asset-types",
  },
  {
    key: "voices",
    to: "/voices",
    icon: Mic,
    label: "Voices",
    group: "asset-types",
  },
  {
    key: "sounds",
    to: "/sounds",
    icon: Music,
    label: "Sounds",
    group: "asset-types",
  },
  {
    key: "musics",
    to: "/musics",
    icon: AudioLines,
    label: "Musics",
    group: "asset-types",
  },

  {
    key: "categories",
    to: "/categories",
    icon: ListTree,
    label: "Categories",
    group: "taxonomy",
  },
  { key: "eras", to: "/eras", icon: Clock, label: "Eras", group: "taxonomy" },
  {
    key: "locations",
    to: "/locations",
    icon: MapPin,
    label: "Locations",
    group: "taxonomy",
  },
  {
    key: "themes",
    to: "/themes",
    icon: Sparkles,
    label: "Themes",
    group: "taxonomy",
  },
  {
    key: "genres",
    to: "/genres",
    icon: Drama,
    label: "Genres",
    group: "taxonomy",
  },
  {
    key: "formats",
    to: "/formats",
    icon: FileText,
    label: "Formats",
    group: "taxonomy",
  },
  {
    key: "users",
    to: "/users",
    icon: UserCog,
    label: "Users",
    group: "taxonomy",
    adminOnly: true,
  },
];

const NAV_ITEM_BASE_CLASS =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";

export function AppSidebar() {
  const { user, isAuthenticated } = useAuthStore();
  // Own role for admin-only nav gating (UX only; the /api/users endpoints are
  // the authoritative gate). Non-admins see the item DISABLED, never hidden.
  const { role, isLoading: isRoleLoading } = useCurrentProfile();
  const isAdmin = role === "admin";

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar-background">
      <div className="p-4">
        <NavLink to="/home" className="text-xl font-bold text-foreground">
          StoryWeaver
        </NavLink>
      </div>

      <nav
        aria-label="Main navigation"
        className="flex-1 space-y-1 overflow-y-auto px-3 py-2"
      >
        {NAV_ITEMS.map((item) => {
          if (item.adminOnly && !isAdmin) {
            // While the role is still resolving, show a neutral reason — don't
            // wrongly tell a real admin "Admins only" before their role loads.
            const reason = isRoleLoading ? "Checking access…" : "Admins only";
            return (
              <TooltipProvider key={item.key} delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      role="link"
                      aria-disabled="true"
                      tabIndex={0}
                      className={cn(
                        NAV_ITEM_BASE_CLASS,
                        "cursor-not-allowed text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right">{reason}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }

          return (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  NAV_ITEM_BASE_CLASS,
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {isAuthenticated && user ? (
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback
                className="bg-primary text-primary-foreground"
                aria-label={user.name}
              >
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 truncate">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
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
  );
}

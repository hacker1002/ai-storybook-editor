// history-sidebar.tsx - Pure presentational sidebar: version list with badges, current indicator, revert button
"use client";

import { RotateCcw } from "lucide-react";
import { cn } from "@/utils/utils";
import { Button } from "@/components/ui/button";
import { formatHistoryTimestamp } from "./history-types";
import type { SnapshotVersion } from "./history-types";

interface HistorySidebarProps {
  versions: SnapshotVersion[];
  selectedVersionId: string | null;
  currentVersionId: string | null;
  isLoading: boolean;
  onVersionSelect: (versionId: string) => void;
  onRevert: (versionId: string) => void;
}

export function HistorySidebar({
  versions,
  selectedVersionId,
  currentVersionId,
  isLoading,
  onVersionSelect,
  onRevert,
}: HistorySidebarProps) {
  // Keyboard navigation: ArrowUp/Down, Home/End
  const handleKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (!versions.length) return;
    const currentIndex = versions.findIndex((v) => v.id === selectedVersionId);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = Math.min(currentIndex + 1, versions.length - 1);
      onVersionSelect(versions[nextIndex].id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = Math.max(currentIndex - 1, 0);
      onVersionSelect(versions[prevIndex].id);
    } else if (e.key === "Home") {
      e.preventDefault();
      onVersionSelect(versions[0].id);
    } else if (e.key === "End") {
      e.preventDefault();
      onVersionSelect(versions[versions.length - 1].id);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (currentIndex >= 0) onVersionSelect(versions[currentIndex].id);
    }
  };

  return (
    <nav
      aria-label="Version list"
      className="flex flex-col w-[280px] shrink-0 border-r h-full overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center px-4 h-12 border-b shrink-0">
        <h2 className="text-sm font-semibold">History</h2>
      </div>

      {/* Loading state — 3 skeleton placeholders */}
      {isLoading && (
        <div className="flex flex-col gap-2 p-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 w-full rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && versions.length === 0 && (
        <div className="flex items-center justify-center flex-1">
          <p className="text-sm text-muted-foreground">No saved versions</p>
        </div>
      )}

      {/* Version list */}
      {!isLoading && versions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Snapshot versions"
          className="flex-1 overflow-y-auto p-1"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {versions.map((version) => {
            const isSelected = version.id === selectedVersionId;
            const isCurrent = version.id === currentVersionId;

            return (
              <li
                key={version.id}
                role="option"
                aria-selected={isSelected}
                aria-current={isCurrent ? "true" : undefined}
                className={cn(
                  "group relative flex flex-col gap-1 px-3 py-2 rounded-md cursor-pointer select-none transition-colors",
                  isSelected
                    ? "bg-muted"
                    : "hover:bg-muted/60"
                )}
                onClick={() => onVersionSelect(version.id)}
              >
                {/* Row 1: timestamp + revert icon */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">
                    {formatHistoryTimestamp(version.updated_at)}
                  </span>
                  {/* Revert button: hidden for current version, shown on hover/selected */}
                  {!isCurrent && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
                        isSelected && "opacity-100"
                      )}
                      title="Revert to this version"
                      aria-label="Revert to this version"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRevert(version.id);
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                {/* Row 2: save type badge + current indicator */}
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      version.save_type === 1
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-600"
                    )}
                  >
                    {version.save_type === 1 ? "Manual" : "Auto"}
                  </span>
                  {isCurrent && (
                    <span className="text-xs text-accent font-medium">
                      Current
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

export default HistorySidebar;

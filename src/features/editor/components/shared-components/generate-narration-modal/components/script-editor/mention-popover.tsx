// mention-popover.tsx — Autocomplete popover for ScriptEditor @-mentions.
// Lists narrator + characters, filters by substring match on key/name,
// and exposes keyboard nav via imperative handle so the textarea can
// forward Arrow/Enter/Escape without stealing focus.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { Character } from '@/types/character-types';
import type { NarratorSettings, NarratorLanguageEntry } from '@/types/editor';

const log = createLogger('NarrationScriptEditor', 'MentionPopover');

interface VirtualAnchor {
  getBoundingClientRect: () => DOMRect;
}

export interface MentionPopoverProps {
  open: boolean;
  anchor: VirtualAnchor;
  filter: string;
  narrator: NarratorSettings | null;
  characters: Character[];
  currentLanguage: string;
  onSelect: (speakerKey: string) => void;
  onClose: () => void;
}

export interface MentionPopoverHandle {
  moveUp: () => void;
  moveDown: () => void;
  confirm: () => void;
  itemCount: () => number;
}

interface MentionItemData {
  key: string;
  label: string;
  sublabel?: string;
  badge?: string;
  warning: boolean;
}

/** Read the language entry for a narrator settings JSONB without widening. */
function readNarratorLanguageEntry(
  narrator: NarratorSettings | null,
  languageKey: string,
): NarratorLanguageEntry | null {
  if (!narrator) return null;
  const entry = narrator[languageKey];
  if (entry && typeof entry === 'object' && 'voice_id' in entry) {
    return entry as NarratorLanguageEntry;
  }
  return null;
}

/** Build filtered mention items from narrator + characters. */
function buildItems(
  narrator: NarratorSettings | null,
  characters: Character[],
  currentLanguage: string,
  filter: string,
): MentionItemData[] {
  const lcFilter = filter.toLowerCase();
  const items: MentionItemData[] = [];

  // Narrator: always present unless filter clearly doesn't match.
  if ('narrator'.includes(lcFilter)) {
    const entry = readNarratorLanguageEntry(narrator, currentLanguage);
    items.push({
      key: 'narrator',
      label: 'narrator',
      badge: currentLanguage,
      warning: !entry?.voice_id,
    });
  }

  for (const char of characters) {
    const matchesKey = char.key.toLowerCase().includes(lcFilter);
    const matchesName = char.name.toLowerCase().includes(lcFilter);
    if (!matchesKey && !matchesName) continue;
    items.push({
      key: char.key,
      label: char.name,
      sublabel: `@${char.key}`,
      warning: !char.voice_setting?.voice_id,
    });
  }

  return items;
}

interface MentionItemProps {
  item: MentionItemData;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}

function MentionItem({ item, active, onSelect, onHover }: MentionItemProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseDown={(e) => {
        // Prevent blur of textarea before click handler fires.
        e.preventDefault();
        onSelect();
      }}
      onMouseEnter={onHover}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
      )}
    >
      <span className="flex flex-1 items-center gap-1.5 truncate">
        <span className="truncate font-medium">{item.label}</span>
        {item.sublabel && (
          <span className="truncate text-xs text-muted-foreground">
            {item.sublabel}
          </span>
        )}
      </span>
      <span className="flex items-center gap-1.5">
        {item.badge && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {item.badge}
          </span>
        )}
        {item.warning && (
          <AlertTriangle
            className="h-3.5 w-3.5 text-amber-500"
            aria-label="No voice configured"
          />
        )}
      </span>
    </button>
  );
}

export const MentionPopover = forwardRef<
  MentionPopoverHandle,
  MentionPopoverProps
>(function MentionPopover(
  { open, anchor, filter, narrator, characters, currentLanguage, onSelect, onClose },
  ref,
) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => buildItems(narrator, characters, currentLanguage, filter),
    [narrator, characters, currentLanguage, filter],
  );

  // Clamp active index when item list shrinks (e.g. filter narrows).
  useEffect(() => {
    if (activeIndex >= items.length) {
      setActiveIndex(items.length > 0 ? items.length - 1 : 0);
    }
  }, [items.length, activeIndex]);

  // Auto-close if filter eliminates all matches — caller also watches filter
  // but this guard prevents a stale empty popover lingering.
  useEffect(() => {
    if (open && items.length === 0) {
      log.debug('autoClose', 'no matches for filter', { filterLength: filter.length });
      onClose();
    }
  }, [open, items.length, filter.length, onClose]);

  useImperativeHandle(
    ref,
    () => ({
      moveUp: () =>
        setActiveIndex((prev) => (prev - 1 + items.length) % Math.max(items.length, 1)),
      moveDown: () =>
        setActiveIndex((prev) => (prev + 1) % Math.max(items.length, 1)),
      confirm: () => {
        const item = items[activeIndex];
        if (item) onSelect(item.key);
      },
      itemCount: () => items.length,
    }),
    [items, activeIndex, onSelect],
  );

  if (!open || items.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={(next) => { if (!next) onClose(); }} modal={false}>
      <PopoverAnchor virtualRef={{ current: anchor as unknown as HTMLElement }} />
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // Let the textarea keep focus; caret-movement clicks should not
          // close the popover via interact-outside. The caller closes via
          // mention-context detection instead.
          e.preventDefault();
        }}
        className="w-64 p-1"
      >
        <div ref={listRef} role="listbox" aria-label="Mention suggestions">
          {items.map((item, idx) => (
            <MentionItem
              key={item.key}
              item={item}
              active={idx === activeIndex}
              onSelect={() => onSelect(item.key)}
              onHover={() => setActiveIndex(idx)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
});

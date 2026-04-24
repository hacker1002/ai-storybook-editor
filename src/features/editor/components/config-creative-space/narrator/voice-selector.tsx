import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useVoices } from '@/stores/voices-store';
import type { Voice } from '@/types/voice';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

import { VoiceSelectorItem } from './voice-selector-item';

// ─────────────────────────────────────────────────────────────────────────────
// VoiceSelector — popover-based voice picker scoped to a single language.
//
// - Filters voices client-side by `voice.language === languageCode`.
// - Search matches name / accent / tags / description (case-insensitive).
// - No audio playback inside the popover (preview lives in VoicePreviewCard).
// - Empty state links to `/voices` so user can create one.
// - MVP keyboard: Enter selects (via native button), Esc closes (Radix default).
//   Arrow-key navigation intentionally deferred (approved Phase 04 MVP).
// ─────────────────────────────────────────────────────────────────────────────

const log = createLogger('ConfigNarrator', 'VoiceSelector');

export interface VoiceSelectorProps {
  languageCode: string;
  value: string | null; // voice_id
  onChange: (voiceId: string) => void;
  disabled?: boolean;
}

function matchesSearch(voice: Voice, needle: string): boolean {
  const haystack = [
    voice.name,
    voice.accent ?? '',
    voice.tags ?? '',
    voice.description ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export function VoiceSelector({ languageCode, value, onChange, disabled }: VoiceSelectorProps) {
  const voices = useVoices();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const voicesForLang = useMemo(
    () => voices.filter((v) => v.language === languageCode),
    [voices, languageCode],
  );

  const filteredVoices = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return voicesForLang;
    return voicesForLang.filter((v) => matchesSearch(v, needle));
  }, [voicesForLang, search]);

  const currentVoice = useMemo(
    () => voices.find((v) => v.id === value) ?? null,
    [voices, value],
  );

  const handleOpenChange = useCallback((next: boolean) => {
    setIsOpen(next);
    if (!next) {
      // Clear search when closing so reopen shows full list.
      setSearch('');
    }
  }, []);

  const handleSelect = useCallback(
    (voiceId: string) => {
      log.info('onSelect', 'voice picked', { languageCode, voiceId });
      onChange(voiceId);
      setIsOpen(false);
      setSearch('');
    },
    [languageCode, onChange],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      log.debug('search', 'input change', { len: next.length });
      setSearch(next);
    },
    [],
  );

  const hasVoicesForLang = voicesForLang.length > 0;
  const hasMatches = filteredVoices.length > 0;

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !currentVoice && 'text-muted-foreground',
          )}
        >
          <span className="truncate">
            {currentVoice ? currentVoice.name : 'Chọn giọng đọc'}
          </span>
          <ChevronDown className="h-4 w-4 opacity-60 shrink-0 ml-2" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-2 w-[--radix-popover-trigger-width] min-w-[240px]"
      >
        <div className="relative mb-2">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder="Tìm giọng đọc..."
            className="h-8 pl-7 text-sm"
            aria-label="Search voices"
          />
        </div>

        {!hasVoicesForLang ? (
          <div className="px-3 py-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Không có giọng đọc cho ngôn ngữ này.
            </p>
            <Link
              to="/voices"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => {
                log.info('emptyCta', 'navigate to voices page');
              }}
            >
              Tạo voice mới →
            </Link>
          </div>
        ) : !hasMatches ? (
          <div className="px-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">Không khớp kết quả.</p>
          </div>
        ) : (
          <div
            role="listbox"
            aria-label="Voices"
            className="max-h-[360px] overflow-y-auto flex flex-col gap-0.5"
          >
            {filteredVoices.map((voice) => (
              <VoiceSelectorItem
                key={voice.id}
                voice={voice}
                isSelected={voice.id === value}
                onClick={() => handleSelect(voice.id)}
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

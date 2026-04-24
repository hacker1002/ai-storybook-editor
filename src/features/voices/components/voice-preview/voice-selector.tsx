import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { VOICE_LANGUAGES } from '@/constants/config-constants';
import { useVoices } from '@/stores/voices-store';
import type { Voice } from '@/types/voice';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

import { VoiceSelectorItem } from './voice-selector-item';

// ─────────────────────────────────────────────────────────────────────────────
// VoiceSelector — popover-based voice picker.
//
// Modes:
// - `languageCode` provided → filter voices to that language (narrator pattern).
// - `languageCode` omitted  → show all voices (character voice-setting pattern).
// - `groupByLanguage=true`  → render sticky headers grouped by voice.language,
//   ordered by VOICE_LANGUAGES; remainder fall into "Other" group.
// ─────────────────────────────────────────────────────────────────────────────

const log = createLogger('VoicePreview', 'VoiceSelector');

export interface VoiceSelectorProps {
  /** If provided, filter voices to this language. If omitted, show all. */
  languageCode?: string;
  /** If true, group items by voice.language with sticky header. Default false. */
  groupByLanguage?: boolean;
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

interface VoiceGroup {
  code: string; // e.g. 'en_US' or '__other__'
  label: string;
  voices: Voice[];
}

const OTHER_GROUP_CODE = '__other__';

function buildGroups(voices: Voice[]): VoiceGroup[] {
  const byLang = new Map<string, Voice[]>();
  for (const v of voices) {
    const key = v.language ?? '';
    if (!byLang.has(key)) byLang.set(key, []);
    byLang.get(key)!.push(v);
  }

  const ordered: VoiceGroup[] = [];
  for (const lang of VOICE_LANGUAGES) {
    const bucket = byLang.get(lang.code);
    if (bucket && bucket.length > 0) {
      ordered.push({ code: lang.code, label: lang.label, voices: bucket });
    }
  }

  const knownCodes = new Set<string>(VOICE_LANGUAGES.map((l) => l.code));
  const otherVoices: Voice[] = [];
  for (const [key, bucket] of byLang.entries()) {
    if (!knownCodes.has(key)) otherVoices.push(...bucket);
  }
  if (otherVoices.length > 0) {
    ordered.push({ code: OTHER_GROUP_CODE, label: 'Other', voices: otherVoices });
  }
  return ordered;
}

export function VoiceSelector({
  languageCode,
  groupByLanguage = false,
  value,
  onChange,
  disabled,
}: VoiceSelectorProps) {
  const voices = useVoices();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const candidateVoices = useMemo(
    () => (languageCode ? voices.filter((v) => v.language === languageCode) : voices),
    [voices, languageCode],
  );

  const filteredVoices = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return candidateVoices;
    return candidateVoices.filter((v) => matchesSearch(v, needle));
  }, [candidateVoices, search]);

  const groups = useMemo(
    () => (groupByLanguage ? buildGroups(filteredVoices) : []),
    [groupByLanguage, filteredVoices],
  );

  const currentVoice = useMemo(
    () => voices.find((v) => v.id === value) ?? null,
    [voices, value],
  );

  const handleOpenChange = useCallback((next: boolean) => {
    setIsOpen(next);
    if (!next) setSearch('');
  }, []);

  const handleSelect = useCallback(
    (voiceId: string) => {
      log.info('onSelect', 'voice picked', { languageCode: languageCode ?? '(any)', voiceId });
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

  const hasAnyCandidates = candidateVoices.length > 0;
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

        {!hasAnyCandidates ? (
          <div className="px-3 py-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              {languageCode
                ? 'Không có giọng đọc cho ngôn ngữ này.'
                : 'Chưa có voice nào.'}
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
        ) : groupByLanguage ? (
          <div
            role="listbox"
            aria-label="Voices"
            className="max-h-[360px] overflow-y-auto flex flex-col gap-0.5"
          >
            {groups.map((group) => (
              <div key={group.code} className="flex flex-col gap-0.5">
                <div className="sticky top-0 z-10 bg-popover px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b">
                  {group.label}
                </div>
                {group.voices.map((voice) => (
                  <VoiceSelectorItem
                    key={voice.id}
                    voice={voice}
                    isSelected={voice.id === value}
                    onClick={() => handleSelect(voice.id)}
                  />
                ))}
              </div>
            ))}
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

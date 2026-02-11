import { useState } from 'react';
import { ChevronDown, Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCurrentLanguage, useEditorSettingsActions } from '@/stores/editor-settings-store';
import { AVAILABLE_LANGUAGES } from '@/constants/editor-constants';
import type { Language } from '@/types/editor';
import { cn } from '@/lib/utils';

interface LanguageSelectorProps {
  onLanguageChange?: (newLang: Language, prevLang: Language) => void;
}

export function LanguageSelector({ onLanguageChange }: LanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentLanguage = useCurrentLanguage();
  const { setCurrentLanguage } = useEditorSettingsActions();

  const handleSelect = (lang: Language) => {
    const prevLang = currentLanguage;
    setCurrentLanguage(lang);
    onLanguageChange?.(lang, prevLang);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Globe className="h-4 w-4" />
          <span className="hidden md:inline">{currentLanguage.name}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        {AVAILABLE_LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleSelect(lang)}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
              'hover:bg-accent hover:text-accent-foreground',
              lang.code === currentLanguage.code && 'bg-accent'
            )}
          >
            {lang.code === currentLanguage.code && <Check className="h-4 w-4" />}
            {lang.code !== currentLanguage.code && <span className="w-4" />}
            {lang.name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

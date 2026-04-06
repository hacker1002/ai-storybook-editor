import { useState, useEffect, useRef } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createLogger } from '@/utils/logger';
import type { ShareLink, ShareLinkUpdatePayload } from './share-link-types';
import {
  EDITION_OPTIONS,
  LANGUAGE_OPTIONS,
  PRIVACY_OPTIONS,
} from './share-link-types';

const log = createLogger('Editor', 'ShareLinkDetailPanel');

const DEBOUNCE_MS = 500;

interface ShareLinkDetailPanelProps {
  link: ShareLink;
  isSaving: boolean;
  onUpdate: (linkId: string, changes: ShareLinkUpdatePayload) => void;
}

export function ShareLinkDetailPanel({
  link,
  isSaving,
  onUpdate,
}: ShareLinkDetailPanelProps) {
  // Local debounced state for text fields
  const [localName, setLocalName] = useState(link.name);
  const [localPasscode, setLocalPasscode] = useState('');

  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passcodeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local name when link changes (e.g., switching between links)
  useEffect(() => {
    setLocalName(link.name);
    setLocalPasscode(''); // Always reset passcode input when switching links
  }, [link.id, link.name]);

  // Clear debounce timers on unmount to prevent stale saves
  useEffect(() => {
    return () => {
      if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
      if (passcodeDebounceRef.current) clearTimeout(passcodeDebounceRef.current);
    };
  }, []);

  // --- Name field ---
  const handleNameChange = (value: string) => {
    setLocalName(value);
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    nameDebounceRef.current = setTimeout(() => {
      log.debug('handleNameChange', 'debounced save', { linkId: link.id });
      onUpdate(link.id, { name: value });
    }, DEBOUNCE_MS);
  };

  // --- URL copy ---
  const fullUrl = `${window.location.origin}/share/${link.url}`;
  const handleCopyUrl = async () => {
    // Try modern Clipboard API first, fall back to execCommand for iframe/HTTP contexts
    try {
      await navigator.clipboard.writeText(fullUrl);
      log.debug('handleCopyUrl', 'copied via clipboard API', { linkId: link.id });
      toast.success('Link copied');
      return;
    } catch {
      log.warn('handleCopyUrl', 'clipboard API unavailable, trying execCommand');
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = fullUrl;
      textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      log.debug('handleCopyUrl', 'copied via execCommand', { linkId: link.id });
      toast.success('Link copied');
    } catch {
      log.warn('handleCopyUrl', 'both copy methods failed');
      toast.error('Failed to copy link');
    }
  };

  // --- Editions ---
  // Convention "empty = all": {} means all editions allowed → show all checked
  const isEditionsEmpty =
    !link.editions.classic && !link.editions.dynamic && !link.editions.interactive;

  const handleEditionChange = (key: 'classic' | 'dynamic' | 'interactive', checked: boolean) => {
    // Expand empty to explicit-all before applying the toggle
    const effective = isEditionsEmpty
      ? { classic: true, dynamic: true, interactive: true }
      : { ...link.editions };
    const updated = { ...effective, [key]: checked };
    // If all false → normalize back to {} (= all)
    const allFalse = !updated.classic && !updated.dynamic && !updated.interactive;
    log.debug('handleEditionChange', 'edition toggled', { linkId: link.id, key, checked });
    onUpdate(link.id, { editions: allFalse ? {} : updated });
  };

  // --- Languages ---
  // Convention "empty = all": [] means all languages allowed → show all checked
  const isLanguagesEmpty = link.languages.length === 0;

  const handleLanguageChange = (code: string, checked: boolean) => {
    // Expand empty to explicit-all before applying the toggle
    const effective = isLanguagesEmpty ? [...LANGUAGE_OPTIONS] : [...link.languages];
    let updated;
    if (checked) {
      const option = LANGUAGE_OPTIONS.find((l) => l.code === code);
      updated = option && !effective.find((l) => l.code === code)
        ? [...effective, option]
        : effective;
    } else {
      updated = effective.filter((l) => l.code !== code);
    }
    // If all languages selected → normalize back to [] (= all)
    const allSelected = LANGUAGE_OPTIONS.every((opt) => updated.some((l) => l.code === opt.code));
    log.debug('handleLanguageChange', 'language toggled', { linkId: link.id, code, checked });
    onUpdate(link.id, { languages: allSelected ? [] : updated });
  };

  // --- Privacy ---
  const handlePrivacyChange = (value: string) => {
    const privacy = parseInt(value, 10) as 1 | 2;
    log.debug('handlePrivacyChange', 'privacy changed', { linkId: link.id, privacy });
    onUpdate(link.id, { privacy });
  };

  // --- Passcode ---
  const handlePasscodeChange = (value: string) => {
    setLocalPasscode(value);
    if (passcodeDebounceRef.current) clearTimeout(passcodeDebounceRef.current);
    if (!value) return; // Empty = no update
    passcodeDebounceRef.current = setTimeout(() => {
      log.debug('handlePasscodeChange', 'debounced save', { linkId: link.id });
      onUpdate(link.id, { passcode: value }); // Hook will hash
    }, DEBOUNCE_MS);
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-lg space-y-6">
        {/* Saving indicator */}
        {isSaving && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving...
          </div>
        )}

        {/* NAME */}
        <div className="space-y-1.5">
          <Label htmlFor={`name-${link.id}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Name
          </Label>
          <Input
            id={`name-${link.id}`}
            value={localName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Link name"
          />
        </div>

        {/* URL */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            URL
          </Label>
          <div className="flex items-center gap-2">
            <Input value={fullUrl} readOnly className="flex-1 bg-muted/50 text-muted-foreground" />
            <Button variant="outline" size="icon" onClick={handleCopyUrl} title="Copy link">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* EDITIONS */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Editions
          </Label>
          <div className="space-y-2">
            {EDITION_OPTIONS.map((opt) => (
              <div key={opt.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`edition-${link.id}-${opt.key}`}
                  checked={isEditionsEmpty || !!link.editions[opt.key]}
                  onChange={(e) => handleEditionChange(opt.key, e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <label
                  htmlFor={`edition-${link.id}-${opt.key}`}
                  className="cursor-pointer text-sm"
                >
                  {opt.label}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* LANGUAGES */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Languages
          </Label>
          <div className="space-y-2">
            {LANGUAGE_OPTIONS.map((lang) => {
              const isChecked = isLanguagesEmpty || link.languages.some((l) => l.code === lang.code);
              return (
                <div key={lang.code} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`lang-${link.id}-${lang.code}`}
                    checked={isChecked}
                    onChange={(e) => handleLanguageChange(lang.code, e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  <label
                    htmlFor={`lang-${link.id}-${lang.code}`}
                    className="cursor-pointer text-sm"
                  >
                    {lang.name}
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        {/* PRIVACY */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Privacy
          </Label>
          <Select value={String(link.privacy)} onValueChange={handlePrivacyChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIVACY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* PASSCODE — only when private */}
        {link.privacy === 2 && (
          <div className="space-y-1.5">
            <Label
              htmlFor={`passcode-${link.id}`}
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Passcode
            </Label>
            <Input
              id={`passcode-${link.id}`}
              type="password"
              value={localPasscode}
              onChange={(e) => handlePasscodeChange(e.target.value)}
              placeholder="Enter new passcode"
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to keep the existing passcode
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

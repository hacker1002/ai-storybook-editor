import { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createLogger } from '@/utils/logger';
import type {
  CreateShareLinkInput,
  RemixOption,
  ShareEditions,
  ShareLanguage,
  SharePrivacy,
} from './share-link-types';
import {
  EDITION_OPTIONS,
  LANGUAGE_OPTIONS,
  ORIGINAL_REMIX_ID_SENTINEL,
  PRIVACY_OPTIONS,
} from './share-link-types';

const log = createLogger('Editor', 'CreateShareLinkDialog');

interface CreateShareLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remixOptions: RemixOption[];
  onSubmit: (input: CreateShareLinkInput) => Promise<void>;
}

type EditionKey = (typeof EDITION_OPTIONS)[number]['key'];

const ALL_EDITIONS_TRUE: Required<ShareEditions> = {
  classic: true,
  dynamic: true,
  interactive: true,
};

// Storage normalization (matches detail-panel convention):
// - If all 3 editions selected, store {} (= "all").
// - If subset selected, store explicit map.
function normalizeEditions(checked: Required<ShareEditions>): ShareEditions {
  const allTrue = checked.classic && checked.dynamic && checked.interactive;
  if (allTrue) return {};
  return {
    classic: checked.classic,
    dynamic: checked.dynamic,
    interactive: checked.interactive,
  };
}

// Storage normalization:
// - If selection covers full LANGUAGE_OPTIONS (i.e. Original + all checked), store [] (= "all").
// - Otherwise (remix-restricted or partial), store explicit list. Downstream "[] = all"
//   would be wrong when a remix narrows the universe — so always explicit for remix.
function normalizeLanguages(
  selected: ShareLanguage[],
  isRemixRestricted: boolean,
): ShareLanguage[] {
  if (isRemixRestricted) return selected;
  const allSelected = LANGUAGE_OPTIONS.every((opt) =>
    selected.some((l) => l.code === opt.code),
  );
  return allSelected ? [] : selected;
}

export function CreateShareLinkDialog({
  open,
  onOpenChange,
  remixOptions,
  onSubmit,
}: CreateShareLinkDialogProps) {
  const [name, setName] = useState('Untitled Link');
  const [remixValue, setRemixValue] = useState<string>(ORIGINAL_REMIX_ID_SENTINEL);
  const [editions, setEditions] = useState<Required<ShareEditions>>(ALL_EDITIONS_TRUE);
  const [selectedLangCodes, setSelectedLangCodes] = useState<Set<string>>(
    () => new Set(LANGUAGE_OPTIONS.map((l) => l.code)),
  );
  const [privacy, setPrivacy] = useState<SharePrivacy>(1);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available languages for the currently-selected remix.
  // Original (no available_languages on option) → full LANGUAGE_OPTIONS.
  const selectedRemix = useMemo(
    () =>
      remixOptions.find(
        (r) => (r.id ?? ORIGINAL_REMIX_ID_SENTINEL) === remixValue,
      ) ?? null,
    [remixOptions, remixValue],
  );
  const availableLanguages: ShareLanguage[] =
    selectedRemix?.available_languages ?? LANGUAGE_OPTIONS;
  const isRemixRestricted = selectedRemix?.id !== null && !!selectedRemix?.available_languages;

  // When remix changes, re-default language selection to "all available for this remix".
  // Intentionally re-select-all on every remix switch (per spec: "mặc định hiển thị và
  // chọn cả 5 ngôn ngữ" / restricted set). User can then uncheck.
  useEffect(() => {
    setSelectedLangCodes(new Set(availableLanguages.map((l) => l.code)));
    log.debug('remixChange', 'language defaults reset', {
      remix_id: selectedRemix?.id ?? null,
      count: availableLanguages.length,
    });
  }, [remixValue]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset form when dialog reopens.
  useEffect(() => {
    if (!open) return;
    setName('Untitled Link');
    setRemixValue(ORIGINAL_REMIX_ID_SENTINEL);
    setEditions(ALL_EDITIONS_TRUE);
    setSelectedLangCodes(new Set(LANGUAGE_OPTIONS.map((l) => l.code)));
    setPrivacy(1);
    setPasscode('');
    setError(null);
    setIsSubmitting(false);
  }, [open]);

  const toggleEdition = (key: EditionKey, checked: boolean) => {
    log.debug('toggleEdition', 'edition toggled', { key, checked });
    setEditions((prev) => ({ ...prev, [key]: checked }));
  };

  const toggleLanguage = (code: string, checked: boolean) => {
    log.debug('toggleLanguage', 'language toggled', { code, checked });
    setSelectedLangCodes((prev) => {
      const next = new Set(prev);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required');
      return;
    }
    const anyEdition = editions.classic || editions.dynamic || editions.interactive;
    if (!anyEdition) {
      setError('Select at least one edition');
      return;
    }
    if (selectedLangCodes.size === 0) {
      setError('Select at least one language');
      return;
    }
    if (privacy === 2 && !passcode.trim()) {
      setError('Passcode is required for private links');
      return;
    }

    const selectedLanguages = availableLanguages.filter((l) =>
      selectedLangCodes.has(l.code),
    );
    const remix_id = remixValue === ORIGINAL_REMIX_ID_SENTINEL ? null : remixValue;

    const input: CreateShareLinkInput = {
      name: trimmedName,
      remix_id,
      editions: normalizeEditions(editions),
      languages: normalizeLanguages(selectedLanguages, isRemixRestricted),
      privacy,
      passcode: privacy === 2 ? passcode : undefined,
    };

    log.info('handleSubmit', 'submitting create payload', {
      remix_id,
      privacy,
      edition_count: Object.values(input.editions).filter(Boolean).length,
      language_count: input.languages.length,
    });

    setIsSubmitting(true);
    try {
      await onSubmit(input);
      onOpenChange(false);
    } catch (e) {
      log.error('handleSubmit', 'submit failed', { error: String(e) });
      setError('Failed to create share link');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create share link</DialogTitle>
          <DialogDescription>
            Configure how this share link presents your book. Remix cannot be changed later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* NAME */}
          <div className="space-y-1.5">
            <Label
              htmlFor="create-share-name"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Name
            </Label>
            <Input
              id="create-share-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Link name"
              autoFocus
            />
          </div>

          {/* REMIXES */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Remixes
            </Label>
            <Select value={remixValue} onValueChange={setRemixValue}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {remixOptions.map((opt) => {
                  const value = opt.id ?? ORIGINAL_REMIX_ID_SENTINEL;
                  return (
                    <SelectItem key={value} value={value}>
                      {opt.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
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
                    id={`create-edition-${opt.key}`}
                    checked={editions[opt.key]}
                    onChange={(e) => toggleEdition(opt.key, e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  <label
                    htmlFor={`create-edition-${opt.key}`}
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
            {availableLanguages.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                This remix has no enabled languages.
              </p>
            ) : (
              <div className="space-y-2">
                {availableLanguages.map((lang) => (
                  <div key={lang.code} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`create-lang-${lang.code}`}
                      checked={selectedLangCodes.has(lang.code)}
                      onChange={(e) => toggleLanguage(lang.code, e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    <label
                      htmlFor={`create-lang-${lang.code}`}
                      className="cursor-pointer text-sm"
                    >
                      {lang.name}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PRIVACY */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Privacy
            </Label>
            <Select
              value={String(privacy)}
              onValueChange={(v) => setPrivacy(parseInt(v, 10) as SharePrivacy)}
            >
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
          {privacy === 2 && (
            <div className="space-y-1.5">
              <Label
                htmlFor="create-share-passcode"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Passcode
              </Label>
              <Input
                id="create-share-passcode"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
                autoComplete="new-password"
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

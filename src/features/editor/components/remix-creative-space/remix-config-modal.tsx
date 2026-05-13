// remix-config-modal.tsx — Create/Edit remix configuration modal.
// Filter-driven: only book-allowed entries render. Save validates ≥1 enabled.

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useHumans } from '@/stores/humans-store';
import { useVoicesStore } from '@/stores/voices-store';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { BookRemix } from '@/types/editor';
import type {
  RemixCharacterChoice,
  RemixConfig,
  RemixPropChoice,
} from '@/types/remix';

const log = createLogger('Editor', 'RemixConfigModal');

interface Props {
  mode: 'create' | 'edit';
  bookRemix: BookRemix;
  initialConfig: RemixConfig;
  onSave: (config: RemixConfig, name: string) => void | Promise<void>;
  onCancel: () => void;
  /** Initial name shown in the rename input. Modal owns local state from here. */
  initialName?: string;
}

export function RemixConfigModal({
  mode,
  bookRemix,
  initialConfig,
  onSave,
  onCancel,
  initialName,
}: Props) {
  const [draft, setDraft] = useState<RemixConfig>(initialConfig);
  const [name, setName] = useState<string>(initialName ?? '');
  const [dirty, setDirty] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);

  const humans = useHumans();
  const voices = useVoicesStore((s) => s.voices);

  const allowedChars = useMemo(
    () => bookRemix.characters.filter((c) => c.is_enabled),
    [bookRemix],
  );
  const allowedProps = useMemo(
    () => bookRemix.props.filter((p) => p.is_enabled),
    [bookRemix],
  );
  const allowedLangs = useMemo(
    () => bookRemix.languages.filter((l) => l.is_enabled),
    [bookRemix],
  );
  const narratorOn = bookRemix.narrator.is_enabled;

  const isValid = useMemo(() => {
    if (draft.characters.some((c) => c.is_enabled)) return true;
    if (draft.props.some((p) => p.is_enabled)) return true;
    if (draft.narrator !== undefined) return true;
    if (draft.languages.some((l) => l.is_enabled)) return true;
    return false;
  }, [draft]);

  const upsertCharacter = (key: string, patch: Partial<RemixCharacterChoice>) => {
    setDraft((prev) => ({
      ...prev,
      characters: prev.characters.some((c) => c.key === key)
        ? prev.characters.map((c) => (c.key === key ? { ...c, ...patch } : c))
        : [
            ...prev.characters,
            {
              key,
              human_id: null,
              visual: null,
              voice_id: null,
              is_enabled: true,
              ...patch,
            },
          ],
    }));
    setDirty(true);
  };

  const upsertProp = (key: string, patch: Partial<RemixPropChoice>) => {
    setDraft((prev) => ({
      ...prev,
      props: prev.props.some((p) => p.key === key)
        ? prev.props.map((p) => (p.key === key ? { ...p, ...patch } : p))
        : [
            ...prev.props,
            { key, prop_id: null, visual: null, is_enabled: true, ...patch },
          ],
    }));
    setDirty(true);
  };

  const toggleLanguage = (code: string, langName: string, enabled: boolean) => {
    setDraft((prev) => ({
      ...prev,
      languages: prev.languages.some((l) => l.code === code)
        ? prev.languages.map((l) =>
            l.code === code ? { ...l, is_enabled: enabled } : l,
          )
        : [...prev.languages, { name: langName, code, is_enabled: enabled }],
    }));
    setDirty(true);
  };

  const toggleNarrator = (enabled: boolean) => {
    setDraft((prev) => ({
      ...prev,
      narrator: enabled
        ? prev.narrator ?? { name: '', voice_id: null }
        : undefined,
    }));
    setDirty(true);
  };

  const updateNarrator = (patch: Partial<{ name: string; voice_id: string | null }>) => {
    setDraft((prev) =>
      prev.narrator
        ? { ...prev, narrator: { ...prev.narrator, ...patch } }
        : prev,
    );
    setDirty(true);
  };

  const handleCancel = () => {
    if (dirty) {
      setShowDiscard(true);
      return;
    }
    onCancel();
  };

  const handleSave = async () => {
    log.info('handleSave', 'submitting', { mode, name });
    await onSave(draft, name.trim());
  };

  const humanOptions = useMemo(
    () =>
      humans.map((h) => ({
        value: h.id,
        label: h.sourceName || h.id,
      })),
    [humans],
  );

  const voiceOptions = useMemo(
    () =>
      voices.map((v) => ({
        value: v.id,
        label: v.name,
      })),
    [voices],
  );

  // Cascading: visual options derived from selected human's visualProfiles.
  // Persisted as profile.name (composite key with human_id).
  const visualOptionsForHuman = (humanId: string | null) => {
    if (!humanId) return [];
    const human = humans.find((h) => h.id === humanId);
    return (
      human?.visualProfiles.map((vp) => ({ value: vp.name, label: vp.name })) ??
      []
    );
  };

  const handleCharacterHumanChange = (key: string, humanId: string | null) => {
    // Cascade: clear visual when human changes to avoid stale (human_id, name) refs.
    upsertCharacter(key, { human_id: humanId, visual: null });
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) handleCancel();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? 'Create Remix' : 'Edit Remix Config'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
                placeholder="Untitled Remix"
              />
            </div>

            {allowedChars.length > 0 && (
              <Section label="CHARACTERS">
                {allowedChars.map((bookChar) => {
                  const entry = draft.characters.find((c) => c.key === bookChar.key);
                  const enabled = entry?.is_enabled ?? false;
                  const humanId = entry?.human_id ?? null;
                  return (
                    <div
                      key={bookChar.key}
                      className={cn(
                        'flex items-center gap-3 py-2',
                        !enabled && 'opacity-60',
                      )}
                    >
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) =>
                          upsertCharacter(bookChar.key, { is_enabled: v })
                        }
                        aria-label={`Toggle ${bookChar.name}`}
                      />
                      <span className="flex-1 min-w-0 truncate text-sm font-medium">
                        {bookChar.name}
                      </span>
                      <SearchableDropdown
                        options={humanOptions}
                        value={humanId}
                        onChange={(id) =>
                          handleCharacterHumanChange(bookChar.key, id)
                        }
                        placeholder="Human"
                        disabled={!enabled}
                        className="w-[140px] shrink-0"
                      />
                      <SearchableDropdown
                        options={visualOptionsForHuman(humanId)}
                        value={entry?.visual ?? null}
                        onChange={(v) =>
                          upsertCharacter(bookChar.key, { visual: v })
                        }
                        placeholder={humanId ? 'Visual' : 'Pick Human'}
                        disabled={!enabled || !humanId}
                        className="w-[140px] shrink-0"
                      />
                      <SearchableDropdown
                        options={voiceOptions}
                        value={entry?.voice_id ?? null}
                        onChange={(id) =>
                          upsertCharacter(bookChar.key, { voice_id: id })
                        }
                        placeholder="Voice"
                        disabled={!enabled}
                        className="w-[140px] shrink-0"
                      />
                    </div>
                  );
                })}
              </Section>
            )}

            {allowedProps.length > 0 && (
              <Section label="PROPS">
                {allowedProps.map((bookProp) => {
                  const entry = draft.props.find((p) => p.key === bookProp.key);
                  const enabled = entry?.is_enabled ?? false;
                  return (
                    <div
                      key={bookProp.key}
                      className={cn(
                        'flex items-center gap-3 py-2',
                        !enabled && 'opacity-60',
                      )}
                    >
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) =>
                          upsertProp(bookProp.key, { is_enabled: v })
                        }
                        aria-label={`Toggle ${bookProp.name}`}
                      />
                      <span className="flex-1 min-w-0 truncate text-sm font-medium">
                        {bookProp.name}
                      </span>
                      {/* Prop + Visual mirror Character's Human + Visual flow.
                          Items library TBD — both dropdowns render empty options for now.
                          Cascading: Visual options will derive from items[prop_id].visualProfiles. */}
                      <SearchableDropdown
                        options={[]}
                        value={entry?.prop_id ?? null}
                        onChange={(id) =>
                          upsertProp(bookProp.key, { prop_id: id, visual: null })
                        }
                        placeholder="Prop"
                        disabled={!enabled}
                        className="w-[140px] shrink-0"
                      />
                      <SearchableDropdown
                        options={[]}
                        value={entry?.visual ?? null}
                        onChange={(v) =>
                          upsertProp(bookProp.key, { visual: v })
                        }
                        placeholder={entry?.prop_id ? 'Visual' : 'Pick Prop'}
                        disabled={!enabled || !entry?.prop_id}
                        className="w-[140px] shrink-0"
                      />
                    </div>
                  );
                })}
              </Section>
            )}

            {narratorOn && (
              <Section label="NARRATOR">
                <div
                  className={cn(
                    'flex items-center gap-3 py-2',
                    !draft.narrator && 'opacity-60',
                  )}
                >
                  <Switch
                    checked={!!draft.narrator}
                    onCheckedChange={toggleNarrator}
                    aria-label="Toggle narrator"
                  />
                  <Input
                    value={draft.narrator?.name ?? ''}
                    onChange={(e) => updateNarrator({ name: e.target.value })}
                    placeholder="Narrator name"
                    disabled={!draft.narrator}
                    className="flex-1 min-w-0"
                  />
                  <SearchableDropdown
                    options={voiceOptions}
                    value={draft.narrator?.voice_id ?? null}
                    onChange={(id) => updateNarrator({ voice_id: id })}
                    placeholder="Voice"
                    disabled={!draft.narrator}
                    className="w-[140px] shrink-0"
                  />
                </div>
              </Section>
            )}

            {allowedLangs.length > 0 && (
              <Section label="LANGUAGES">
                {allowedLangs.map((lang) => {
                  const entry = draft.languages.find((l) => l.code === lang.code);
                  const enabled = entry?.is_enabled ?? false;
                  return (
                    <div
                      key={lang.code}
                      className="flex items-center gap-3 py-1.5"
                    >
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) =>
                          toggleLanguage(lang.code, lang.name, v)
                        }
                        aria-label={`Toggle ${lang.name}`}
                      />
                      <span className="text-sm">{lang.name}</span>
                    </div>
                  );
                })}
              </Section>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
            <Button disabled={!isValid} onClick={handleSave}>
              {mode === 'create' ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDiscard} onOpenChange={setShowDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Closing now will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDiscard(false);
                onCancel();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground">
        {label}
      </h3>
      <Separator />
      <div className="pt-1">{children}</div>
    </div>
  );
}

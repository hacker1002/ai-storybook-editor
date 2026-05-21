// remix-config-modal.tsx — Create-only remix configuration modal (tabbed).
// Edit mode was removed (config is frozen after create). Four tabs:
// Characters (with live appearance swap) / Props / Voices / Languages.
//
// The modal owns `draft` (RemixConfig), `name`, `dirty`, and ephemeral
// `swapTasks` (per-character live-swap preview state). Switching tabs never
// resets draft/swapTasks. OK is disabled while any swap is loading so a remix
// is never created mid-swap (Validation S1).

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import { useCharacters } from '@/stores/snapshot-store/selectors';
import { createLogger } from '@/utils/logger';
import { TRAIT_TYPES } from '@/constants/trait-constants';
import type { BookRemix } from '@/types/editor';
import type { Human } from '@/types/human';
import {
  REMIX_NAME_DEFAULT,
  type RemixCharacterChoice,
  type RemixConfig,
  type RemixLanguageChoice,
  type RemixPropChoice,
  type RemixVoiceChoice,
  type SwapPreviewState,
} from '@/types/remix';
import { CharactersTab } from './tabs/characters-tab';
import { PropsTab } from './tabs/props-tab';
import { VoicesTab } from './tabs/voices-tab';
import { LanguagesTab } from './tabs/languages-tab';
import { resolveBaseSheetUrl } from './tabs/resolve-base-sheet-url';
import { runCharacterSwap } from './tabs/run-character-swap';

const log = createLogger('Editor', 'RemixConfigModal');

type TabKey = 'characters' | 'props' | 'voices' | 'languages';
const TAB_ORDER: TabKey[] = ['characters', 'props', 'voices', 'languages'];
const TAB_LABELS: Record<TabKey, string> = {
  characters: 'Characters',
  props: 'Props',
  voices: 'Voices',
  languages: 'Languages',
};

interface Props {
  bookRemix: BookRemix;
  initialConfig: RemixConfig;
  onSave: (config: RemixConfig, name: string) => void | Promise<void>;
  onCancel: () => void;
}

export function RemixConfigModal({
  bookRemix,
  initialConfig,
  onSave,
  onCancel,
}: Props) {
  const [draft, setDraft] = useState<RemixConfig>(initialConfig);
  const [name, setName] = useState('');
  const [dirty, setDirty] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [swapTasks, setSwapTasks] = useState<Record<string, SwapPreviewState>>({});

  const humans = useHumans();
  const snapshotChars = useCharacters();

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

  const firstNonEmptyTab = useMemo<TabKey>(() => {
    if (allowedChars.length) return 'characters';
    if (allowedProps.length) return 'props';
    if (draft.voices.length) return 'voices';
    if (allowedLangs.length) return 'languages';
    return 'characters';
  }, [allowedChars, allowedProps, allowedLangs, draft.voices]);

  const [activeTab, setActiveTab] = useState<TabKey>(firstNonEmptyTab);

  // ── Upsert helpers (preserve entries across toggles) ──────────────────────
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
              traits: TRAIT_TYPES.map((type) => ({ type, is_enabled: true })),
              base_image_url: null,
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
        : [...prev.props, { key, prop_id: null, visual: null, is_enabled: true, ...patch }],
    }));
    setDirty(true);
  };

  const upsertVoice = (key: string, patch: Partial<RemixVoiceChoice>) => {
    setDraft((prev) => ({
      ...prev,
      voices: prev.voices.map((v) => (v.key === key ? { ...v, ...patch } : v)),
    }));
    setDirty(true);
  };

  const upsertLanguage = (code: string, patch: Partial<RemixLanguageChoice>) => {
    setDraft((prev) => ({
      ...prev,
      languages: prev.languages.some((l) => l.code === code)
        ? prev.languages.map((l) => (l.code === code ? { ...l, ...patch } : l))
        : [...prev.languages, { name: '', code, is_enabled: false, ...patch }],
    }));
    setDirty(true);
  };

  // ── Live character swap orchestration (testable helper, injected deps) ────
  const humansMap = useMemo<Record<string, Human>>(
    () => Object.fromEntries(humans.map((h) => [h.id, h])),
    [humans],
  );

  const setTask = (key: string, state: SwapPreviewState) =>
    setSwapTasks((prev) => ({ ...prev, [key]: state }));

  // Current (pre-swap) base-sheet visual per allowed character — shown in the
  // accordion body even before any swap so the user sees the existing art.
  const currentVisualUrls = useMemo<Record<string, string | null>>(
    () =>
      Object.fromEntries(
        allowedChars.map((c) => [c.key, resolveBaseSheetUrl(c.key, snapshotChars)]),
      ),
    [allowedChars, snapshotChars],
  );

  const handleSwapCharacter = (charKey: string) => {
    const entry = draft.characters.find((c) => c.key === charKey);
    if (!entry) {
      log.warn('handleSwapCharacter', 'no draft entry', { charKey });
      return;
    }
    const beforeUrl = resolveBaseSheetUrl(charKey, snapshotChars);
    log.debug('handleSwapCharacter', 'invoke', { charKey, hasBeforeUrl: !!beforeUrl });
    void runCharacterSwap(
      charKey,
      entry,
      beforeUrl,
      humansMap,
      snapshotChars,
      setTask,
      upsertCharacter,
    );
  };

  // ── Validation / gating ───────────────────────────────────────────────────
  const isValidDraft = useMemo(() => {
    return (
      draft.characters.some((c) => c.is_enabled) ||
      draft.props.some((p) => p.is_enabled) ||
      draft.voices.some((v) => v.is_enabled) ||
      draft.languages.some((l) => l.is_enabled)
    );
  }, [draft]);

  const anySwapLoading = useMemo(
    () => Object.values(swapTasks).some((t) => t.status === 'loading'),
    [swapTasks],
  );

  const canSave = isValidDraft && !anySwapLoading;
  const everyTabEmpty =
    allowedChars.length === 0 &&
    allowedProps.length === 0 &&
    draft.voices.length === 0 &&
    allowedLangs.length === 0;

  const handleCancel = () => {
    if (dirty) {
      setShowDiscard(true);
      return;
    }
    onCancel();
  };

  const handleSave = async () => {
    log.info('handleSave', 'submitting', { name });
    await onSave(draft, name.trim() || REMIX_NAME_DEFAULT);
  };

  // Keyboard: ←/→ cycle tabs (ignore when typing); Enter = OK (when valid).
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const typing =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable;
    if (typing) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const idx = TAB_ORDER.indexOf(activeTab);
      const delta = e.key === 'ArrowLeft' ? -1 : 1;
      const next = TAB_ORDER[(idx + delta + TAB_ORDER.length) % TAB_ORDER.length];
      setActiveTab(next);
    } else if (e.key === 'Enter' && canSave) {
      e.preventDefault();
      void handleSave();
    }
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) handleCancel();
        }}
      >
        <DialogContent
          className="flex h-[700px] max-h-[700px] w-[900px] max-w-[900px] flex-col"
          onKeyDown={handleKeyDown}
        >
          {/* Visually-hidden title — Radix Dialog needs it for aria-labelledby. */}
          <DialogTitle className="sr-only">Create Remix</DialogTitle>

          {/* Title input intentionally does NOT mark the draft dirty. */}
          <Input
            id="remix-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={REMIX_NAME_DEFAULT}
            className="w-[200px]"
          />

          {everyTabEmpty ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nothing to configure. Enable items in book remix settings first.
            </p>
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as TabKey)}
              className="mt-2 flex min-h-0 flex-1 flex-col"
            >
              <TabsList>
                {TAB_ORDER.map((key) => (
                  <TabsTrigger key={key} value={key}>
                    {TAB_LABELS[key]}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <TabsContent value="characters">
                  <CharactersTab
                    allowedChars={allowedChars}
                    draftCharacters={draft.characters}
                    humans={humans}
                    swapTasks={swapTasks}
                    currentVisualUrls={currentVisualUrls}
                    onUpsert={upsertCharacter}
                    onSwap={handleSwapCharacter}
                  />
                </TabsContent>
                <TabsContent value="props">
                  <PropsTab
                    allowedProps={allowedProps}
                    draftProps={draft.props}
                    onUpsert={upsertProp}
                  />
                </TabsContent>
                <TabsContent value="voices">
                  <VoicesTab draftVoices={draft.voices} onUpsert={upsertVoice} />
                </TabsContent>
                <TabsContent value="languages">
                  <LanguagesTab
                    allowedLangs={allowedLangs}
                    draftLanguages={draft.languages}
                    onUpsert={upsertLanguage}
                  />
                </TabsContent>
              </div>
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={handleCancel}>
              Discard
            </Button>
            <Button
              disabled={!canSave}
              aria-disabled={!canSave}
              onClick={handleSave}
              title={anySwapLoading ? 'Waiting for swap to finish' : undefined}
            >
              Create
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

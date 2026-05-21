// config-remix-settings.tsx — Remix availability config panel.
// 4 groups (CHARACTERS / PROPS / VOICES / LANGUAGES). Toggles persist immediately
// via updateBook. Entries are upserted (preserved when toggled OFF) so a character's
// per-trait config survives a re-toggle. Name is materialized from the live
// snapshot on every upsert. Rows derive from snapshot (book.remix is an overlay).

import * as React from 'react';
import { useCurrentBook, useBookRemix, useBookActions } from '@/stores/book-store';
import { useCharacters, useProps } from '@/stores/snapshot-store/selectors';
import {
  DEFAULT_REMIX,
  NARRATOR_VOICE_KEY,
  REMIX_LANGUAGES,
  makeDefaultTraits,
  normalizeRemixTraits,
} from '@/constants/config-constants';
import type {
  BookRemix,
  RemixPropEntry,
  RemixLanguageEntry,
  RemixVoiceEntry,
} from '@/types/editor';
import type { TraitType } from '@/types/human';
import type { Character } from '@/types/character-types';
import type { Prop } from '@/types/prop-types';
import { CharacterRemixRow } from './remix/character-remix-row';
import { PropRemixRow } from './remix/prop-remix-row';
import { LanguageRemixRow } from './remix/language-remix-row';
import { VoiceRemixRow } from './remix/voice-remix-row';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'ConfigRemixSettings');

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 border-b pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-xs italic text-muted-foreground">{children}</p>;
}

function summarizeRemix(remix: BookRemix) {
  return {
    chars: remix.characters.length,
    props: remix.props.length,
    langs: remix.languages.length,
    voices: remix.voices.length,
  };
}

export function ConfigRemixSettings() {
  const book = useCurrentBook();
  const remixRaw = useBookRemix();
  const { updateBook } = useBookActions();
  const snapshotChars = useCharacters();
  const snapshotProps = useProps();

  if (!book) return null;

  const remix: BookRemix = {
    characters: remixRaw?.characters ?? DEFAULT_REMIX.characters,
    props:      remixRaw?.props      ?? DEFAULT_REMIX.props,
    languages:  remixRaw?.languages  ?? DEFAULT_REMIX.languages,
    voices:     remixRaw?.voices     ?? DEFAULT_REMIX.voices,
  };

  const persist = (next: BookRemix) => {
    log.debug('persist', 'updating remix', summarizeRemix(next));
    void updateBook(book.id, { remix: next });
  };

  const upsertCharacter = (ch: Character, patch: { is_enabled: boolean }) => {
    log.info('upsertCharacter', 'start', { key: ch.key, enabled: patch.is_enabled });
    const next = [...remix.characters];
    const idx = next.findIndex((c) => c.key === ch.key);
    if (idx >= 0) {
      log.debug('upsertCharacter', 'update', { idx });
      next[idx] = { ...next[idx], ...patch, name: ch.name, traits: normalizeRemixTraits(next[idx].traits) };
    } else {
      log.debug('upsertCharacter', 'insert', { key: ch.key });
      next.push({ key: ch.key, name: ch.name, is_enabled: patch.is_enabled, traits: makeDefaultTraits() });
    }
    persist({ ...remix, characters: next });
  };

  const upsertCharacterTrait = (ch: Character, type: TraitType, isEnabled: boolean) => {
    log.info('upsertCharacterTrait', 'start', { key: ch.key, type, enabled: isEnabled });
    const next = [...remix.characters];
    let idx = next.findIndex((c) => c.key === ch.key);
    if (idx < 0) {
      log.debug('upsertCharacterTrait', 'insert default entry', { key: ch.key });
      next.push({ key: ch.key, name: ch.name, is_enabled: false, traits: makeDefaultTraits() });
      idx = next.length - 1;
    }
    const traits = normalizeRemixTraits(next[idx].traits).map((t) =>
      t.type === type ? { ...t, is_enabled: isEnabled } : t,
    );
    next[idx] = { ...next[idx], name: ch.name, traits };
    persist({ ...remix, characters: next });
  };

  const upsertVoice = (subj: { key: string; name: string }, patch: { is_enabled: boolean }) => {
    log.info('upsertVoice', 'start', { key: subj.key, enabled: patch.is_enabled });
    const next = [...remix.voices];
    const idx = next.findIndex((v) => v.key === subj.key);
    if (idx >= 0) {
      log.debug('upsertVoice', 'update', { idx });
      next[idx] = { ...next[idx], ...patch, name: subj.name };
    } else {
      log.debug('upsertVoice', 'insert', { key: subj.key });
      next.push({ key: subj.key, name: subj.name, is_enabled: patch.is_enabled });
    }
    persist({ ...remix, voices: next });
  };

  const upsertPropEntry = (pr: Prop, patch: Partial<Pick<RemixPropEntry, 'is_enabled'>>) => {
    log.info('upsertPropEntry', 'start', { key: pr.key, patch });
    const next = [...remix.props];
    const idx = next.findIndex((p) => p.key === pr.key);
    if (idx >= 0) {
      log.debug('upsertPropEntry', 'update', { idx });
      next[idx] = { ...next[idx], ...patch, name: pr.name };
    } else {
      log.debug('upsertPropEntry', 'insert', { key: pr.key });
      next.push({ key: pr.key, name: pr.name, is_enabled: false, ...patch });
    }
    persist({ ...remix, props: next });
  };

  const upsertLanguageEntry = (
    lang: (typeof REMIX_LANGUAGES)[number],
    patch: Partial<Pick<RemixLanguageEntry, 'is_enabled'>>,
  ) => {
    log.info('upsertLanguageEntry', 'start', { code: lang.code, patch });
    const next = [...remix.languages];
    const idx = next.findIndex((l) => l.code === lang.code);
    if (idx >= 0) {
      log.debug('upsertLanguageEntry', 'update', { idx });
      next[idx] = { ...next[idx], ...patch, name: lang.name };
    } else {
      log.debug('upsertLanguageEntry', 'insert', { code: lang.code });
      next.push({ code: lang.code, name: lang.name, is_enabled: false, ...patch });
    }
    persist({ ...remix, languages: next });
  };

  // Voice subjects: one per character, narrator last (matches screenshot).
  const seenVoiceKeys = new Set<string>();
  const voiceSubjects: { key: string; name: string }[] = [];
  for (const ch of snapshotChars) {
    if (seenVoiceKeys.has(ch.key)) {
      log.warn('voiceSubjects', 'duplicate character key skipped', { key: ch.key });
      continue;
    }
    seenVoiceKeys.add(ch.key);
    voiceSubjects.push({ key: ch.key, name: ch.name });
  }
  voiceSubjects.push({ key: NARRATOR_VOICE_KEY, name: 'Narrator' });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <h3 className="text-sm font-semibold">Remix Settings</h3>
      </div>
      <div className="flex flex-col gap-6 overflow-y-auto p-4">
        <div>
          <GroupHeader>Characters</GroupHeader>
          {snapshotChars.length === 0 ? (
            <EmptyState>No characters in book yet</EmptyState>
          ) : (
            <div className="flex flex-col">
              {snapshotChars.map((ch) => {
                const entry = remix.characters.find((c) => c.key === ch.key);
                const isEnabled = entry?.is_enabled ?? false;
                const traits = normalizeRemixTraits(entry?.traits);
                return (
                  <CharacterRemixRow
                    key={ch.key}
                    name={ch.name}
                    checked={isEnabled}
                    traits={traits}
                    onToggle={(next) => upsertCharacter(ch, { is_enabled: next })}
                    onTraitToggle={(type, next) => upsertCharacterTrait(ch, type, next)}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div>
          <GroupHeader>Props</GroupHeader>
          {snapshotProps.length === 0 ? (
            <EmptyState>No props in book yet</EmptyState>
          ) : (
            <div className="flex flex-col">
              {snapshotProps.map((pr) => {
                const entry = remix.props.find((p) => p.key === pr.key);
                const isEnabled = entry?.is_enabled ?? false;
                return (
                  <PropRemixRow
                    key={pr.key}
                    name={pr.name}
                    checked={isEnabled}
                    onToggle={(next) => upsertPropEntry(pr, { is_enabled: next })}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div>
          <GroupHeader>Voices</GroupHeader>
          <div className="flex flex-col">
            {voiceSubjects.map((subj) => {
              const entry = remix.voices.find((v: RemixVoiceEntry) => v.key === subj.key);
              const isEnabled = entry?.is_enabled ?? false;
              return (
                <VoiceRemixRow
                  key={subj.key}
                  name={subj.name}
                  checked={isEnabled}
                  onToggle={(next) => upsertVoice(subj, { is_enabled: next })}
                />
              );
            })}
          </div>
        </div>

        <div>
          <GroupHeader>Languages</GroupHeader>
          <div className="flex flex-col">
            {REMIX_LANGUAGES.map((lang) => {
              const entry = remix.languages.find((l) => l.code === lang.code);
              const isEnabled = entry?.is_enabled ?? false;
              return (
                <LanguageRemixRow
                  key={lang.code}
                  label={lang.label}
                  checked={isEnabled}
                  onToggle={(next) => upsertLanguageEntry(lang, { is_enabled: next })}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

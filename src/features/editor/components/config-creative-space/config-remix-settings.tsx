// config-remix-settings.tsx — Remix availability config panel.
// 4 groups (CHARACTERS / PROPS / NARRATOR / LANGUAGES). Toggles persist immediately
// via updateBook. Entries are upserted (preserved when toggled OFF) so character `type`
// survives a re-toggle. Name is materialized from the live snapshot on every upsert.

import * as React from 'react';
import { useCurrentBook, useBookRemix, useBookActions } from '@/stores/book-store';
import { useCharacters, useProps } from '@/stores/snapshot-store/selectors';
import {
  DEFAULT_CHARACTER_REMIX_TYPE,
  DEFAULT_REMIX,
  REMIX_LANGUAGES,
} from '@/constants/config-constants';
import type {
  BookRemix,
  CharacterRemixType,
  RemixCharacterEntry,
  RemixPropEntry,
  RemixLanguageEntry,
} from '@/types/editor';
import type { Character } from '@/types/character-types';
import type { Prop } from '@/types/prop-types';
import { CharacterRemixRow } from './remix/character-remix-row';
import { PropRemixRow } from './remix/prop-remix-row';
import { LanguageRemixRow } from './remix/language-remix-row';
import { NarratorRemixRow } from './remix/narrator-remix-row';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'ConfigRemixSettings');

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
    narrator: remix.narrator.is_enabled,
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
    narrator:   remixRaw?.narrator   ?? DEFAULT_REMIX.narrator,
  };

  const persist = (next: BookRemix) => {
    log.debug('persist', 'updating remix', summarizeRemix(next));
    void updateBook(book.id, { remix: next });
  };

  const upsertCharacterEntry = (
    ch: Character,
    patch: Partial<Pick<RemixCharacterEntry, 'is_enabled' | 'type'>>,
  ) => {
    log.info('upsertCharacterEntry', 'start', { key: ch.key, patch });
    const next = [...remix.characters];
    const idx = next.findIndex((c) => c.key === ch.key);
    if (idx >= 0) {
      log.debug('upsertCharacterEntry', 'update', { idx });
      next[idx] = { ...next[idx], ...patch, name: ch.name };
    } else {
      log.debug('upsertCharacterEntry', 'insert', { key: ch.key });
      next.push({
        key: ch.key,
        name: ch.name,
        type: DEFAULT_CHARACTER_REMIX_TYPE,
        is_enabled: false,
        ...patch,
      });
    }
    persist({ ...remix, characters: next });
  };

  const upsertPropEntry = (
    pr: Prop,
    patch: Partial<Pick<RemixPropEntry, 'is_enabled'>>,
  ) => {
    log.info('upsertPropEntry', 'start', { key: pr.key, patch });
    const next = [...remix.props];
    const idx = next.findIndex((p) => p.key === pr.key);
    if (idx >= 0) {
      log.debug('upsertPropEntry', 'update', { idx });
      next[idx] = { ...next[idx], ...patch, name: pr.name };
    } else {
      log.debug('upsertPropEntry', 'insert', { key: pr.key });
      next.push({
        key: pr.key,
        name: pr.name,
        is_enabled: false,
        ...patch,
      });
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
      next.push({
        code: lang.code,
        name: lang.name,
        is_enabled: false,
        ...patch,
      });
    }
    persist({ ...remix, languages: next });
  };

  const toggleNarrator = (next: boolean) => {
    log.info('toggleNarrator', 'toggle', { next });
    persist({ ...remix, narrator: { is_enabled: next } });
  };

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
                const type = entry?.type ?? DEFAULT_CHARACTER_REMIX_TYPE;
                return (
                  <CharacterRemixRow
                    key={ch.key}
                    name={ch.name}
                    checked={isEnabled}
                    type={type}
                    onToggle={(next) =>
                      upsertCharacterEntry(ch, { is_enabled: next, type })
                    }
                    onTypeChange={(nextType: CharacterRemixType) =>
                      upsertCharacterEntry(ch, { is_enabled: isEnabled, type: nextType })
                    }
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
          <GroupHeader>Narrator</GroupHeader>
          <NarratorRemixRow
            checked={remix.narrator.is_enabled}
            onToggle={toggleNarrator}
          />
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

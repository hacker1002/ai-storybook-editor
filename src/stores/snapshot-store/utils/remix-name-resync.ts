// remix-name-resync.ts — eager cascade of character/prop name into book.remix
// when the snapshot owner renames an entity. Dynamic getState() avoids a static
// import cycle between snapshot-store and book-store.

import { useBookStore } from '@/stores/book-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'RemixNameResync');

export type RemixCascadeKind = 'character' | 'prop';

export function cascadeRemixName(
  kind: RemixCascadeKind,
  key: string,
  newName: string,
): void {
  log.info('cascadeRemixName', 'start', { kind, key });

  const bookState = useBookStore.getState();
  const book = bookState.currentBook;
  if (!book || !book.remix) {
    log.debug('cascadeRemixName', 'skip: no book or no remix', { hasBook: !!book });
    return;
  }

  const remix = book.remix;

  if (kind === 'character') {
    const idx = remix.characters.findIndex((c) => c.key === key);
    if (idx < 0) {
      log.debug('cascadeRemixName', 'skip: no character entry', { key });
      return;
    }
    if (remix.characters[idx].name === newName) {
      log.debug('cascadeRemixName', 'skip: name unchanged', { key });
      return;
    }
    const next = [...remix.characters];
    next[idx] = { ...next[idx], name: newName };
    void bookState.updateBook(book.id, { remix: { ...remix, characters: next } });
    log.debug('cascadeRemixName', 'updated character', { key, newName });
    return;
  }

  // kind === 'prop'
  const idx = remix.props.findIndex((p) => p.key === key);
  if (idx < 0) {
    log.debug('cascadeRemixName', 'skip: no prop entry', { key });
    return;
  }
  if (remix.props[idx].name === newName) {
    log.debug('cascadeRemixName', 'skip: name unchanged', { key });
    return;
  }
  const next = [...remix.props];
  next[idx] = { ...next[idx], name: newName };
  void bookState.updateBook(book.id, { remix: { ...remix, props: next } });
  log.debug('cascadeRemixName', 'updated prop', { key, newName });
}

/**
 * Eager cleanup of book.remix entries when a snapshot entity is deleted (soft FK
 * has no DB cascade). Character delete drops both the characters[] entry AND the
 * matching voices[] entry (key match; the 'narrator' voice never matches a
 * character key). Prop delete drops the props[] entry. Idempotent: no matching
 * entry → no updateBook call.
 */
export function cascadeRemixDelete(kind: RemixCascadeKind, key: string): void {
  log.info('cascadeRemixDelete', 'start', { kind, key });

  const bookState = useBookStore.getState();
  const book = bookState.currentBook;
  if (!book || !book.remix) {
    log.debug('cascadeRemixDelete', 'skip: no book or no remix', { hasBook: !!book });
    return;
  }

  const remix = book.remix;

  if (kind === 'character') {
    const nextChars = remix.characters.filter((c) => c.key !== key);
    const nextVoices = remix.voices.filter((v) => v.key !== key);
    if (
      nextChars.length === remix.characters.length &&
      nextVoices.length === remix.voices.length
    ) {
      log.debug('cascadeRemixDelete', 'skip: no character/voice entry', { key });
      return;
    }
    void bookState.updateBook(book.id, {
      remix: { ...remix, characters: nextChars, voices: nextVoices },
    });
    log.debug('cascadeRemixDelete', 'dropped character + voice', { key });
    return;
  }

  // kind === 'prop'
  const nextProps = remix.props.filter((p) => p.key !== key);
  if (nextProps.length === remix.props.length) {
    log.debug('cascadeRemixDelete', 'skip: no prop entry', { key });
    return;
  }
  void bookState.updateBook(book.id, { remix: { ...remix, props: nextProps } });
  log.debug('cascadeRemixDelete', 'dropped prop', { key });
}

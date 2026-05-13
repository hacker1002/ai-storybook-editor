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

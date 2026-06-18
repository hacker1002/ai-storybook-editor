// create-imported-book.ts — Atomic write for an imported book (validated decision
// S1). Build + validate the snapshot fully in-memory FIRST; this only runs once
// there are no errors. Inserts books@step=2 → populated snapshot → sets
// current_version. Rolls back (deletes the book) if the snapshot insert fails, so
// a failed import never leaves an orphan empty book. NOT a reuse of createBook
// (which hardcodes step:1 + an empty snapshot).

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type { ImportModalMeta } from './import-script-types';
import type { ImportedSnapshot } from './build-snapshot-from-parsed';

const log = createLogger('Books', 'CreateImportedBook');

/** YYYYMMDDHHmm — same stamp shape as book-store/snapshot-store. */
function versionStamp(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}`;
}

export async function createImportedBook(
  meta: ImportModalMeta,
  snapshot: ImportedSnapshot,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log.error('createImportedBook', 'no authenticated user');
    throw new Error('Vui lòng đăng nhập để import truyện');
  }

  log.info('createImportedBook', 'insert book', { title: meta.title });
  const { data: book, error: bookError } = await supabase
    .from('books')
    .insert({
      title: meta.title,
      owner_id: user.id,
      format_id: meta.format_id,
      book_type: 1,
      dimension: meta.dimension,
      target_audience: meta.target_audience,
      artstyle_id: meta.artstyle_id ?? null,
      step: 2, // illustration phase
      type: 1,
      original_language: meta.original_language,
    })
    .select('*')
    .single();

  if (bookError || !book) {
    log.error('createImportedBook', 'book insert failed', { error: bookError });
    throw new Error('Không thể tạo sách khi import');
  }

  const version = versionStamp();
  const { data: snap, error: snapError } = await supabase
    .from('snapshots')
    .insert({
      book_id: book.id,
      docs: snapshot.docs,
      dummies: [],
      illustration: snapshot.illustration,
      props: snapshot.props,
      characters: snapshot.characters,
      stages: snapshot.stages,
      version,
      save_type: 1,
    })
    .select('id')
    .single();

  if (snapError || !snap) {
    log.error('createImportedBook', 'snapshot insert failed, rolling back book', {
      bookId: book.id,
      error: snapError,
    });
    // ROLLBACK — best-effort delete to avoid an orphan empty book.
    const { error: rollbackError } = await supabase.from('books').delete().eq('id', book.id);
    if (rollbackError) {
      log.error('createImportedBook', 'rollback delete failed (orphan book)', {
        bookId: book.id,
        error: rollbackError,
      });
    }
    throw new Error('Ghi snapshot thất bại khi import');
  }

  // Set current_version — accept eventual consistency on failure (mirrors saveSnapshot).
  const { error: updateError } = await supabase
    .from('books')
    .update({ current_version: snap.id })
    .eq('id', book.id);
  if (updateError) {
    log.warn('createImportedBook', 'failed to set current_version (eventual-consistent)', {
      bookId: book.id,
      snapshotId: snap.id,
      error: updateError,
    });
  }

  log.info('createImportedBook', 'done', { bookId: book.id, snapshotId: snap.id, version });
  return book.id;
}

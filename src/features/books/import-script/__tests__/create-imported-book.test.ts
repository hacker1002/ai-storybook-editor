import { describe, it, expect, beforeEach, vi } from 'vitest';

// Shared mock state — vi.hoisted so the (hoisted) vi.mock factory can close over it.
const mock = vi.hoisted(() => ({
  failSnapshot: false,
  calls: { booksInsert: 0, snapshotsInsert: 0, booksUpdate: 0, booksDelete: 0 },
}));

vi.mock('@/apis/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from(table: string) {
      return {
        insert() {
          if (table === 'books') mock.calls.booksInsert++;
          if (table === 'snapshots') mock.calls.snapshotsInsert++;
          return {
            select: () => ({
              single: async () => {
                if (table === 'books') return { data: { id: 'book-1' }, error: null };
                if (mock.failSnapshot) return { data: null, error: { message: 'snapshot boom' } };
                return { data: { id: 'snap-1' }, error: null };
              },
            }),
          };
        },
        update() {
          if (table === 'books') mock.calls.booksUpdate++;
          return { eq: async () => ({ error: null }) };
        },
        delete() {
          return {
            eq: async () => {
              if (table === 'books') mock.calls.booksDelete++;
              return { error: null };
            },
          };
        },
      };
    },
  },
}));

import { createImportedBook } from '../create-imported-book';
import type { ImportedSnapshot } from '../build-snapshot-from-parsed';
import { MODAL_META } from './fixtures/visual-manuscript-fixture';

const SNAPSHOT: ImportedSnapshot = {
  docs: [],
  illustration: { spreads: [], sections: [] },
  characters: [],
  props: [],
  stages: [],
};

beforeEach(() => {
  mock.failSnapshot = false;
  mock.calls.booksInsert = 0;
  mock.calls.snapshotsInsert = 0;
  mock.calls.booksUpdate = 0;
  mock.calls.booksDelete = 0;
});

describe('createImportedBook', () => {
  it('happy path: inserts book + snapshot, sets current_version, returns the book id', async () => {
    const id = await createImportedBook(MODAL_META, SNAPSHOT);
    expect(id).toBe('book-1');
    expect(mock.calls).toMatchObject({
      booksInsert: 1,
      snapshotsInsert: 1,
      booksUpdate: 1,
      booksDelete: 0,
    });
  });

  it('rolls back (deletes the book) when the snapshot insert fails', async () => {
    mock.failSnapshot = true;
    await expect(createImportedBook(MODAL_META, SNAPSHOT)).rejects.toThrow(/snapshot/i);
    expect(mock.calls).toMatchObject({
      booksInsert: 1,
      snapshotsInsert: 1,
      booksDelete: 1, // rollback
      booksUpdate: 0, // never reached
    });
  });
});

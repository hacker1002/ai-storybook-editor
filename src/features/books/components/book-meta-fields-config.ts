// book-meta-fields-config.ts — Value/type exports for the shared book-metadata
// field set. Kept out of book-meta-fields.tsx so that component file exports ONLY
// the component (react-refresh/only-export-components). Imported by NewBookModal,
// ImportBookModal, and BookMetaFields itself.

export interface BookMetaValue {
  title: string;
  formatId: string;
  dimension: string;
  targetAudience: string;
  originalLanguage: string;
  artstyleId: string | null;
}

export const INITIAL_BOOK_META: BookMetaValue = {
  title: '',
  formatId: '',
  dimension: '',
  targetAudience: '',
  originalLanguage: 'en_US',
  artstyleId: null,
};

/** Art Style intentionally EXCLUDED (optional). */
export function isBookMetaValid(v: BookMetaValue): boolean {
  return (
    v.title.trim().length > 0 &&
    !!v.formatId &&
    !!v.dimension &&
    !!v.targetAudience &&
    !!v.originalLanguage
  );
}

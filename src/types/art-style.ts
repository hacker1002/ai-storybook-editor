// art-style.ts — Art-style library domain + DB-row types for the /styles page.
// `tags` is raw comma-separated TEXT (source of truth); parse via style-filters.ts.
// `image_references[]` JSONB = [{ title, media_url }] → camelCase StyleImageReference[].

/** A single reference image attached to an art style (Storage public URL). */
export interface StyleImageReference {
  title: string;
  mediaUrl: string;
}

/** Domain shape consumed by UI (camelCase). */
export interface ArtStyle {
  id: string;
  name: string;
  tags: string; // raw comma-separated TEXT (source of truth)
  description: string;
  imageReferences: StyleImageReference[];
  createdAt?: string;
  type: number; // 0=sketch, 1=illustration (soft app-layer discriminator)
}

/** Raw Supabase row shape for `art_styles` (snake_case, nullable columns). */
export interface ArtStyleRow {
  id: string;
  name: string;
  tags: string | null;
  description: string | null;
  image_references: { title: string; media_url: string }[] | null;
  created_at?: string;
  type: number; // 0=sketch, 1=illustration (DB: NOT NULL DEFAULT 1)
}

/** Toolbar "references" filter: any / only-with-images / only-without-images. */
export type ReferencesFilter = 'all' | 'with' | 'none';

/** Toolbar "type" filter: all / sketch (type=0) / illustration (type=1). */
export type StyleTypeFilter = 'all' | 'sketch' | 'illustration';

/** Combined filter state for the styles toolbar. `tags` uses OR semantics. */
export interface StylesFilterState {
  search: string; // "" = no search
  references: ReferencesFilter; // 'all' = no reference filter
  tags: string[]; // [] = all tags; OR-match (style matches if it has ANY selected tag)
  type: StyleTypeFilter; // 'all' = no type filter
}

/** Form modal mode: create / edit / closed. */
export type FormMode = 'create' | 'edit' | null;

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
}

/** Raw Supabase row shape for `art_styles` (snake_case, nullable columns). */
export interface ArtStyleRow {
  id: string;
  name: string;
  tags: string | null;
  description: string | null;
  image_references: { title: string; media_url: string }[] | null;
  created_at?: string;
}

/** Toolbar "references" filter: any / only-with-images / only-without-images. */
export type ReferencesFilter = 'all' | 'with' | 'none';

/** Combined filter state for the styles toolbar. `tags` uses OR semantics. */
export interface StylesFilterState {
  search: string; // "" = no search
  references: ReferencesFilter; // 'all' = no reference filter
  tags: string[]; // [] = all tags; OR-match (style matches if it has ANY selected tag)
}

/** Form modal mode: create / edit / closed. */
export type FormMode = 'create' | 'edit' | null;

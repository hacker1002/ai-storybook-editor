// new-book-modal.tsx — Create-a-book form (Title, Format, Dimension, Target,
// Language, Art Style). 5 fields required; Art Style is OPTIONAL. On submit it
// calls the store's createBook (which unshifts the new row into books[] + sets
// currentBook), then notifies the parent via onCreated. Per validated decision
// S1 the parent STAYS on /books and shows a toast — it does NOT navigate to the
// editor on create.
//
// Lookups (formats + art_styles) are fetched on open. Dialog dismiss is blocked
// while creating. a11y: Field/Label htmlFor for text input, role=alert error,
// combobox aria on ArtStyleSelect.

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { supabase } from '@/apis/supabase';
import { useBookActions } from '@/stores/book-store';
import {
  DIMENSION_OPTIONS,
  TARGET_AUDIENCE_OPTIONS,
} from '@/constants/book-enums';
import { SUPPORTED_LANGUAGES } from '@/constants/config-constants';
import { resolveMultiLangName } from '@/utils/multi-lang-helpers';
import { createLogger } from '@/utils/logger';
import type { ArtStyleOption } from '@/features/books/types';
import { Field } from './field';
import { ArtStyleSelect } from './art-style-select';

const log = createLogger('Books', 'NewBookModal');

interface NewBookModalProps {
  onClose: () => void;
  onCreated: (book: { id: string }) => void;
}

interface NewBookDraft {
  title: string;
  formatId: string;
  dimension: string;
  targetAudience: string;
  originalLanguage: string;
  artstyleId: string | null;
}

interface FormatRow {
  id: string;
  name: Record<string, string>;
}

interface ArtStyleRow {
  id: string;
  name: string;
  image_references: { title: string; media_url: string }[] | null;
}

const INITIAL_DRAFT: NewBookDraft = {
  title: '',
  formatId: '',
  dimension: '',
  targetAudience: '',
  originalLanguage: 'en_US',
  artstyleId: null,
};

export function NewBookModal({ onClose, onCreated }: NewBookModalProps) {
  const { createBook } = useBookActions();

  const [draft, setDraft] = React.useState<NewBookDraft>(INITIAL_DRAFT);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [formats, setFormats] = React.useState<FormatRow[]>([]);
  const [artStyles, setArtStyles] = React.useState<ArtStyleOption[]>([]);
  const [isLoadingLookups, setIsLoadingLookups] = React.useState(false);

  const set = React.useCallback(
    <K extends keyof NewBookDraft>(field: K, value: NewBookDraft[K]) => {
      setDraft((d) => ({ ...d, [field]: value }));
    },
    [],
  );

  const fetchLookups = React.useCallback(async () => {
    log.info('fetchLookups', 'start');
    setIsLoadingLookups(true);
    const [formatsRes, artStylesRes] = await Promise.all([
      supabase.from('formats').select('id, name').order('name'),
      supabase
        .from('art_styles')
        .select('id, name, image_references')
        .order('name'),
    ]);

    if (formatsRes.error) {
      log.error('fetchLookups', 'formats failed', { error: formatsRes.error.message });
    } else {
      setFormats((formatsRes.data ?? []) as FormatRow[]);
    }

    if (artStylesRes.error) {
      log.error('fetchLookups', 'art_styles failed', { error: artStylesRes.error.message });
    } else {
      const mapped: ArtStyleOption[] = ((artStylesRes.data ?? []) as ArtStyleRow[]).map((s) => ({
        id: s.id,
        name: s.name,
        thumbnailUrl: s.image_references?.[0]?.media_url,
      }));
      setArtStyles(mapped);
    }

    log.debug('fetchLookups', 'done', {
      formats: formatsRes.data?.length ?? 0,
      artStyles: artStylesRes.data?.length ?? 0,
    });
    setIsLoadingLookups(false);
  }, []);

  React.useEffect(() => {
    void fetchLookups();
  }, [fetchLookups]);

  // Art Style intentionally EXCLUDED from validation (optional).
  const isValid =
    draft.title.trim().length > 0 &&
    !!draft.formatId &&
    !!draft.dimension &&
    !!draft.targetAudience &&
    !!draft.originalLanguage;

  const formatOptions = React.useMemo(
    () =>
      formats.map((fmt) => ({
        value: fmt.id,
        label: resolveMultiLangName(fmt.name, draft.originalLanguage),
      })),
    [formats, draft.originalLanguage],
  );

  const handleSubmit = React.useCallback(async () => {
    if (!isValid || creating) return;
    log.info('handleSubmit', 'creating book', { title: draft.title.trim() });
    setCreating(true);
    setError(null);

    try {
      const book = await createBook({
        title: draft.title.trim(),
        format_id: draft.formatId,
        dimension: Number(draft.dimension),
        target_audience: Number(draft.targetAudience),
        original_language: draft.originalLanguage,
        artstyle_id: draft.artstyleId ?? null,
      });

      if (!book) {
        log.warn('handleSubmit', 'createBook returned null');
        setError('Could not create book. Please try again.');
        setCreating(false);
        return;
      }

      log.info('handleSubmit', 'created', { bookId: book.id });
      onCreated(book);
      onClose();
    } catch (err) {
      log.error('handleSubmit', 'createBook threw', {
        message: err instanceof Error ? err.message : String(err),
      });
      setError('Could not create book. Please try again.');
      setCreating(false);
    }
  }, [isValid, creating, draft, createBook, onCreated, onClose]);

  // Block dismiss (Esc / click-outside / [X]) while creating.
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (creating) return;
      if (!next) onClose();
    },
    [creating, onClose],
  );

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>New Book</DialogTitle>
          {/* Subtitle kept for screen readers only — mock has no visible description. */}
          <DialogDescription className="sr-only">
            Set up the basics for your new book. You can change these later in the editor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Title" htmlFor="new-book-title">
            <Input
              id="new-book-title"
              autoFocus
              placeholder="Book title..."
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              disabled={creating}
            />
          </Field>

          {/* Format + Dimension share a row (2-col); collapses to 1-col on mobile. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Format">
              <SearchableDropdown
                options={formatOptions}
                value={draft.formatId || null}
                onChange={(v) => set('formatId', v)}
                placeholder={isLoadingLookups ? 'Loading...' : 'Select format...'}
                searchPlaceholder="Search format..."
                disabled={creating || isLoadingLookups}
              />
            </Field>

            <Field label="Dimension">
              <Select
                value={draft.dimension}
                onValueChange={(v) => set('dimension', v)}
                disabled={creating}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select dimension..." />
                </SelectTrigger>
                <SelectContent>
                  {DIMENSION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Target + Language share a row (2-col). */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Target">
              <Select
                value={draft.targetAudience}
                onValueChange={(v) => set('targetAudience', v)}
                disabled={creating}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select target..." />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_AUDIENCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Language">
              <Select
                value={draft.originalLanguage}
                onValueChange={(v) => set('originalLanguage', v)}
                disabled={creating}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select language..." />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Art Style">
            <ArtStyleSelect
              value={draft.artstyleId}
              options={artStyles}
              onChange={(id) => set('artstyleId', id)}
              clearable
              disabled={creating || isLoadingLookups}
            />
          </Field>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || creating}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

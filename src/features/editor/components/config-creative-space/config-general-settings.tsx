// config-general-settings.tsx - General settings panel for book configuration.
// Handles readonly fields (format, dimension, audience, art style) and editable
// fields (theme, genre, era, location, original language).

import * as React from "react";
import { useCurrentBook, useBookActions } from "@/stores/book-store";
import {
  useThemes,
  useSelectedThemeIds,
  usePrimaryThemeId,
  useThemeActions,
  useSelectedThemes,
} from "@/stores/theme-store";
import {
  useGenres,
  useSelectedGenreIds,
  usePrimaryGenreId,
  useGenreActions,
  useSelectedGenres,
} from "@/stores/genre-store";
import { useFormats, useFormatActions } from "@/stores/format-store";
import { useEras, useEraActions } from "@/stores/era-store";
import { useLocations, useLocationActions } from "@/stores/location-store";
import { useArtStyleStore } from "@/stores/art-style-store";
import { useLanguageCode } from "@/stores/editor-settings-store";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import { MultiSelectDropdown } from "@/components/ui/multi-select-dropdown";
import { DIMENSION_MAP, TARGET_AUDIENCE_MAP } from "@/constants/book-enums";
import { SUPPORTED_LANGUAGES } from "@/constants/config-constants";
import { resolveMultiLangName } from "@/utils/multi-lang-helpers";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "ConfigGeneralSettings");

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

export function ConfigGeneralSettings() {
  const book = useCurrentBook();
  const { updateBook } = useBookActions();

  const themes = useThemes();
  const selectedThemeIds = useSelectedThemeIds();
  const selectedThemes = useSelectedThemes();
  const primaryThemeId = usePrimaryThemeId();
  const { fetchThemes, fetchBookThemes, updateBookThemes, setPrimaryTheme } = useThemeActions();

  const genres = useGenres();
  const selectedGenreIds = useSelectedGenreIds();
  const selectedGenres = useSelectedGenres();
  const primaryGenreId = usePrimaryGenreId();
  const { fetchGenres, fetchBookGenres, updateBookGenres, setPrimaryGenre } = useGenreActions();

  const formats = useFormats();
  const { fetchFormats } = useFormatActions();

  const eras = useEras();
  const { fetchEras } = useEraActions();

  const locations = useLocations();
  const { fetchLocations } = useLocationActions();

  const artStyleName = useArtStyleStore((s) => s.name);
  const lang = useLanguageCode();

  // Fetch all lookup data on mount
  React.useEffect(() => {
    log.info("mount", "fetching lookup data");
    void fetchThemes();
    void fetchGenres();
    void fetchFormats();
    void fetchEras();
    void fetchLocations();
  }, [fetchThemes, fetchGenres, fetchFormats, fetchEras, fetchLocations]);

  // Fetch junction data when book changes
  React.useEffect(() => {
    if (!book?.id) return;
    log.info("fetchJunctions", "start", { bookId: book.id });
    void fetchBookThemes(book.id);
    void fetchBookGenres(book.id);
  }, [book?.id, fetchBookThemes, fetchBookGenres]);

  // Fetch art style name if not already loaded
  React.useEffect(() => {
    if (book?.artstyle_id && !artStyleName) {
      log.debug("fetchArtStyle", "triggering", {
        artStyleId: book.artstyle_id,
      });
      void useArtStyleStore.getState().fetchArtStyle(book.artstyle_id);
    }
  }, [book?.artstyle_id, artStyleName]);

  if (!book) return null;

  // ── Derived display values ──────────────────────────────────────────────────

  const formatName = resolveMultiLangName(
    formats.find((f) => f.id === book.format_id)?.name,
    lang
  );
  const dimensionLabel =
    book.dimension != null
      ? DIMENSION_MAP[book.dimension as keyof typeof DIMENSION_MAP] ?? "—"
      : "—";
  const audienceLabel =
    book.target_audience != null
      ? TARGET_AUDIENCE_MAP[
          book.target_audience as keyof typeof TARGET_AUDIENCE_MAP
        ] ?? "—"
      : "—";

  const eraOptions = eras.map((e) => ({ value: e.id, label: e.name }));
  const locationOptions = locations.map((l) => ({
    value: l.id,
    label: l.name,
  }));
  const languageOptions = SUPPORTED_LANGUAGES.map((l) => ({
    value: l.code,
    label: l.label,
  }));
  const themeOptions = themes.map((t) => ({
    value: t.id,
    label: resolveMultiLangName(t.name, lang),
  }));
  const genreOptions = genres.map((g) => ({
    value: g.id,
    label: resolveMultiLangName(g.name, lang),
  }));

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleThemeChange = (values: string[]) => {
    log.info("handleThemeChange", "updating", { count: values.length });
    // Map incoming IDs to { theme_id, is_primary } — preserve existing is_primary flags
    const newThemes = values.map((id) => {
      const existing = selectedThemes.find((t) => t.theme_id === id);
      return { theme_id: id, is_primary: existing?.is_primary ?? false };
    });
    // Store action handles auto-promote when primary is removed
    void updateBookThemes(book.id, newThemes);
  };

  const handleGenreChange = (values: string[]) => {
    log.info("handleGenreChange", "updating", { count: values.length });
    const newGenres = values.map((id) => {
      const existing = selectedGenres.find((g) => g.genre_id === id);
      return { genre_id: id, is_primary: existing?.is_primary ?? false };
    });
    void updateBookGenres(book.id, newGenres);
  };

  const handlePrimaryThemeChange = (themeId: string) => {
    log.info("handlePrimaryThemeChange", "setting primary", { themeId });
    void setPrimaryTheme(book.id, themeId);
  };

  const handlePrimaryGenreChange = (genreId: string) => {
    log.info("handlePrimaryGenreChange", "setting primary", { genreId });
    void setPrimaryGenre(book.id, genreId);
  };

  const handleEraChange = (value: string) => {
    log.info("handleEraChange", "updating", { eraId: value });
    void updateBook(book.id, { era_id: value });
  };

  const handleLocationChange = (value: string) => {
    log.info("handleLocationChange", "updating", { locationId: value });
    void updateBook(book.id, { location_id: value });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <h3 className="text-sm font-semibold">General Settings</h3>
      </div>
      <div className="flex flex-col gap-5 overflow-y-auto p-4">
        {/* FORMAT — readonly */}
        <div>
          <FieldLabel>Format</FieldLabel>
          <SearchableDropdown
            options={formats.map((f) => ({
              value: f.id,
              label: resolveMultiLangName(f.name, lang),
            }))}
            value={book.format_id}
            onChange={() => {}}
            placeholder={formatName}
            disabled
          />
        </div>

        {/* DIMENSION — readonly */}
        <div>
          <FieldLabel>Dimension</FieldLabel>
          <SearchableDropdown
            options={[]}
            value={null}
            onChange={() => {}}
            placeholder={dimensionLabel}
            disabled
          />
        </div>

        {/* TARGET AUDIENCE — readonly */}
        <div>
          <FieldLabel>Target Audience</FieldLabel>
          <SearchableDropdown
            options={[]}
            value={null}
            onChange={() => {}}
            placeholder={audienceLabel}
            disabled
          />
        </div>

        {/* THEME — multi-select with primary support */}
        <div>
          <FieldLabel>Theme</FieldLabel>
          <MultiSelectDropdown
            options={themeOptions}
            selectedValues={selectedThemeIds}
            onChange={handleThemeChange}
            placeholder="Select themes..."
            primaryValue={primaryThemeId ?? undefined}
            onPrimaryChange={handlePrimaryThemeChange}
          />
        </div>

        {/* GENRE — multi-select with primary support */}
        <div>
          <FieldLabel>Genre</FieldLabel>
          <MultiSelectDropdown
            options={genreOptions}
            selectedValues={selectedGenreIds}
            onChange={handleGenreChange}
            placeholder="Select genres..."
            primaryValue={primaryGenreId ?? undefined}
            onPrimaryChange={handlePrimaryGenreChange}
          />
        </div>

        {/* ART STYLE — readonly */}
        <div>
          <FieldLabel>Art Style</FieldLabel>
          <SearchableDropdown
            options={[]}
            value={null}
            onChange={() => {}}
            placeholder={artStyleName ?? "—"}
            disabled
          />
        </div>

        {/* ERA — single-select, editable */}
        <div>
          <FieldLabel>Era</FieldLabel>
          <SearchableDropdown
            options={eraOptions}
            value={book.era_id}
            onChange={handleEraChange}
            placeholder="Select era..."
          />
        </div>

        {/* LOCATION — single-select, editable */}
        <div>
          <FieldLabel>Location</FieldLabel>
          <SearchableDropdown
            options={locationOptions}
            value={book.location_id}
            onChange={handleLocationChange}
            placeholder="Select location..."
          />
        </div>

        {/* ORIGINAL LANGUAGE — readonly (set at book creation) */}
        <div>
          <FieldLabel>Original Language</FieldLabel>
          <SearchableDropdown
            options={languageOptions}
            value={book.original_language}
            onChange={() => {}}
            placeholder="Select language..."
            disabled
          />
        </div>
      </div>
    </div>
  );
}

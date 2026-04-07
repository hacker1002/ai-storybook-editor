// config-general-settings.tsx - General settings panel for book configuration.
// Handles readonly fields (format, dimension, audience, art style) and editable
// fields (theme, genre, era, location, original language, background music).

import * as React from "react";
import { useCurrentBook, useBookActions } from "@/stores/book-store";
import {
  useThemes,
  useSelectedThemeIds,
  useThemeActions,
} from "@/stores/theme-store";
import {
  useGenres,
  useSelectedGenreIds,
  useGenreActions,
} from "@/stores/genre-store";
import { useFormats, useFormatActions } from "@/stores/format-store";
import { useEras, useEraActions } from "@/stores/era-store";
import { useLocations, useLocationActions } from "@/stores/location-store";
import { useArtStyleStore } from "@/stores/art-style-store";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import { MultiSelectDropdown } from "@/components/ui/multi-select-dropdown";
import { DIMENSION_MAP, TARGET_AUDIENCE_MAP } from "@/constants/book-enums";
import { SUPPORTED_LANGUAGES } from "@/constants/config-constants";
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
  const { fetchThemes, fetchBookThemes, updateBookThemes } = useThemeActions();

  const genres = useGenres();
  const selectedGenreIds = useSelectedGenreIds();
  const { fetchGenres, fetchBookGenres, updateBookGenres } = useGenreActions();

  const formats = useFormats();
  const { fetchFormats } = useFormatActions();

  const eras = useEras();
  const { fetchEras } = useEraActions();

  const locations = useLocations();
  const { fetchLocations } = useLocationActions();

  const artStyleName = useArtStyleStore((s) => s.name);

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

  const formatName = formats.find((f) => f.id === book.format_id)?.name ?? "—";
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
  const themeOptions = themes.map((t) => ({ value: t.id, label: t.name }));
  const genreOptions = genres.map((g) => ({ value: g.id, label: g.name }));

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleThemeChange = (values: string[]) => {
    log.info("handleThemeChange", "updating", { count: values.length });
    void updateBookThemes(book.id, values);
  };

  const handleGenreChange = (values: string[]) => {
    log.info("handleGenreChange", "updating", { count: values.length });
    void updateBookGenres(book.id, values);
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
            options={formats.map((f) => ({ value: f.id, label: f.name }))}
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

        {/* THEME — multi-select, editable */}
        <div>
          <FieldLabel>Theme</FieldLabel>
          <MultiSelectDropdown
            options={themeOptions}
            selectedValues={selectedThemeIds}
            onChange={handleThemeChange}
            placeholder="Select themes..."
          />
        </div>

        {/* GENRE — multi-select, editable */}
        <div>
          <FieldLabel>Genre</FieldLabel>
          <MultiSelectDropdown
            options={genreOptions}
            selectedValues={selectedGenreIds}
            onChange={handleGenreChange}
            placeholder="Select genres..."
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

        {/* BACKGROUND MUSIC — disabled placeholder (TBD) */}
        <div>
          <FieldLabel>Background Music</FieldLabel>
          <SearchableDropdown
            options={[]}
            value={null}
            onChange={() => {}}
            placeholder="Coming soon..."
            disabled
          />
        </div>
      </div>
    </div>
  );
}

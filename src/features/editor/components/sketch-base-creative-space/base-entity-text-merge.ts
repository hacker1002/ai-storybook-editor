// base-entity-text-merge.ts — bridge between the Edit modal's SINGLE textarea and the THREE
// separate DB fields it edits (description, height, visual_design). The DB keeps them distinct
// (they travel as separate per-entity rows to the base-sheet generate backend — see
// BaseSheetEntity), but the modal shows them merged under labeled section headers so the user
// edits one blob. parse* is the guard: if a `[Label]` header is deleted we CANNOT know which
// field a chunk of text belongs to, so we reject the whole parse (per-field validation) rather
// than silently misroute — Save stays blocked until the headers are intact.

/** The three fields folded into the merged textarea (art_language stays its own field). */
export interface MergedEntityFields {
  description: string;
  height: string;
  visual_design: string;
}

/** Ordered sections. `field` is the MergedEntityFields key; `label` is the on-screen header. */
const SECTIONS = [
  { field: 'description', label: 'Description' },
  { field: 'height', label: 'Height' },
  { field: 'visual_design', label: 'Visual design' },
] as const;

type SectionField = (typeof SECTIONS)[number]['field'];

/** Header line for a section, e.g. `[Description]`. Matched case-insensitively on parse. */
const headerLine = (label: string) => `[${label}]`;

/** A whole line that is exactly a known section header (trimmed, case-insensitive). */
function matchHeader(line: string): SectionField | null {
  const m = line.trim().match(/^\[(.+)\]$/);
  if (!m) return null;
  const label = m[1].trim().toLowerCase();
  return SECTIONS.find((s) => s.label.toLowerCase() === label)?.field ?? null;
}

/** Serialize the three fields into the labeled single-textarea representation. */
export function formatMergedEntityText(fields: MergedEntityFields): string {
  return SECTIONS.map(({ field, label }) => `${headerLine(label)}\n${fields[field]}`.trimEnd()).join('\n\n');
}

export type MergedParseResult =
  | { ok: true; fields: MergedEntityFields }
  | { ok: false; errors: string[] };

/**
 * Parse the merged textarea back into the three fields. Requires each section header present
 * EXACTLY once; a section body is every line between its header and the next header. Returns
 * structural errors (missing/duplicate header) + per-field rules (visual_design non-empty) so the
 * modal can block Save and point the user at what to fix.
 */
export function parseMergedEntityText(raw: string): MergedParseResult {
  const lines = raw.split('\n');
  const marks: { field: SectionField; index: number }[] = [];
  lines.forEach((line, index) => {
    const field = matchHeader(line);
    if (field) marks.push({ field, index });
  });

  const errors: string[] = [];
  for (const { field, label } of SECTIONS) {
    const count = marks.filter((m) => m.field === field).length;
    if (count === 0) {
      errors.push(`Missing the "${headerLine(label)}" section header — keep it so edits save to the right field.`);
    } else if (count > 1) {
      errors.push(`Duplicate "${headerLine(label)}" section — keep only one.`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  // Headers all present exactly once → slice bodies by header order of appearance.
  const ordered = [...marks].sort((a, b) => a.index - b.index);
  const fields: MergedEntityFields = { description: '', height: '', visual_design: '' };
  ordered.forEach((mark, i) => {
    const start = mark.index + 1;
    const end = i + 1 < ordered.length ? ordered[i + 1].index : lines.length;
    fields[mark.field] = lines.slice(start, end).join('\n').trim();
  });

  if (!fields.visual_design) errors.push("Visual design can't be empty.");
  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, fields };
}

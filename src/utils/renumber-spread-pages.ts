// renumber-spread-pages.ts — single source of truth for the editor's global
// page-numbering convention (previously a private copy in the illustration
// slice + the import builder). Page numbers are GLOBALLY SEQUENTIAL across the
// whole book: every spread consumes 2 page slots, so a single-page double-page
// spread (DPS) gets a combined "N-N+1" string while a two-page spread gets the
// consecutive numbers N, N+1. Mutates the passed spreads in place.
//
// Used by: snapshot-store illustration slice (after reorder/delete) and the
// Excel import pipeline (after assembling spreads in flow order).

/** Recalculate globally-sequential page numbers across an ordered spread list.
 *  DPS (1 page) → number "N-N+1"; two-page → numbers N, N+1. Increments by 2 per spread. */
export function renumberSpreadPages(
  spreads: { pages: { number: string | number }[] }[],
): void {
  let pageNum = 0;
  for (const spread of spreads) {
    if (spread.pages.length === 1) {
      spread.pages[0].number = `${pageNum}-${pageNum + 1}`;
    } else {
      spread.pages[0].number = pageNum;
      if (spread.pages[1]) spread.pages[1].number = pageNum + 1;
    }
    pageNum += 2;
  }
}

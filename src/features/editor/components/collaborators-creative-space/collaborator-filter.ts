// collaborator-filter — client-side sidebar filter type + predicate. Kept in a
// non-component module so the sidebar/popover/root can share it without tripping
// react-refresh/only-export-components (a component file must export only components).

import type { Collaboration, CollabStatus, PipelineStep } from './collaboration-space-types';

/** Client-side sidebar filter (OR within a group, AND across groups). */
export interface CollaboratorFilter {
  languages: string[]; // language codes; [] = no language filter
  steps: PipelineStep[]; // [] = no step filter
  statuses: CollabStatus[]; // [] = no status filter
}

export const EMPTY_FILTER: CollaboratorFilter = { languages: [], steps: [], statuses: [] };

/**
 * Apply the client-side filter: OR within each group, AND across groups. An empty
 * group does not constrain the list (design §2.3).
 */
export function applyFilter(collaborators: Collaboration[], filter: CollaboratorFilter): Collaboration[] {
  return collaborators.filter(
    (c) =>
      // `access_rights` is always present on fresh rows (DEFAULT_ACCESS_RIGHTS), but
      // guard defensively so a legacy/null row never throws when a filter is active.
      (filter.languages.length === 0 ||
        filter.languages.some((l) => c.access_rights?.languages?.includes(l))) &&
      (filter.steps.length === 0 || filter.steps.some((s) => c.access_rights?.steps?.[s]?.enabled)) &&
      (filter.statuses.length === 0 || filter.statuses.includes(c.status)),
  );
}

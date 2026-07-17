// sketch-lineup-creative-space.tsx — root of the Lineup creative space (design README §2). ONE
// space for BOTH kinds (character + prop), covering EVERY variant incl. 'base'. Sidebar picks
// variants; the content area lays their locked crops side-by-side on one shared ruler.
//
// ⚡ READ-ONLY / pure FE (README §5): checking a row or zooming mutates NOTHING — no snapshot write,
// no gateway call, no lock. Hence NO useCollabPersistSession / useHeldResourceSession / job slice
// (the "every new sketch space needs collab flow" checklist applies to spaces with a WRITE path;
// this one has none). Selection + zoom are local state → leaving the space resets them, by design.
//
// React 19: `selectedEntries` is DERIVED in render — a ref whose entry lost selectable (a peer
// unlocked its crop / cleared its height, arriving via the existing realtime sync) simply filters
// itself out. NO useEffect+setState prune, NO ref read/write in render body (both lint errors here).

import { useCallback, useMemo, useState } from 'react';
import { createLogger } from '@/utils/logger';
import { useSketchLineupEntries } from '@/stores/snapshot-store/selectors';
import type { BaseKind, LineupEntry } from '@/types/sketch';
import { LineupSidebar } from './lineup-sidebar';
import { LineupContentArea } from './lineup-content-area';
import { DEFAULT_EXPANDED_GROUPS, KIND_GROUPS, ZOOM, selectable } from './lineup-constants';

const log = createLogger('Editor', 'SketchLineupSpace');

export function SketchLineupSpace() {
  const charEntries = useSketchLineupEntries('characters');
  const propEntries = useSketchLineupEntries('props');

  // Local UI state ONLY — never persisted (README §4.1).
  const [checkedRefs, setCheckedRefs] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [zoom, setZoom] = useState<number>(ZOOM.default);
  const [expandedGroups, setExpandedGroups] =
    useState<Record<BaseKind, boolean>>(DEFAULT_EXPANDED_GROUPS);

  const entriesByKind = useMemo<Record<BaseKind, LineupEntry[]>>(
    () => ({ characters: charEntries, props: propEntries }),
    [charEntries, propEntries],
  );
  // Sidebar order (char → prop, snapshot order) IS the canvas order.
  const allEntries = useMemo(() => [...charEntries, ...propEntries], [charEntries, propEntries]);

  // Derive-prune: checked ∩ still-selectable. Stale refs never need clearing from state.
  const selectedEntries = useMemo(
    () => allEntries.filter((e) => checkedRefs.has(e.ref) && selectable(e)),
    [allEntries, checkedRefs],
  );

  const handleToggleEntry = useCallback((entry: LineupEntry, checked: boolean) => {
    log.info('handleToggleEntry', 'entry toggled', { ref: entry.ref, checked });
    setCheckedRefs((prev) => {
      const next = new Set(prev);
      if (checked) next.add(entry.ref);
      else next.delete(entry.ref);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(
    (checked: boolean) => {
      if (!checked) {
        log.debug('handleToggleAll', 'clearing selection');
        setCheckedRefs(new Set<string>());
        return;
      }
      // Only selectable entries join — disabled rows stay out (they have no image/height to place).
      const refs = allEntries.filter(selectable).map((e) => e.ref);
      log.info('handleToggleAll', 'selecting all selectable entries', { count: refs.length });
      setCheckedRefs(new Set(refs));
    },
    [allEntries],
  );

  const handleToggleGroup = useCallback((kind: BaseKind) => {
    setExpandedGroups((prev) => {
      const next = { ...prev, [kind]: !prev[kind] };
      log.debug('handleToggleGroup', 'group toggled', { kind, expanded: next[kind] });
      return next;
    });
  }, []);

  const handleChangeZoom = useCallback((next: number) => {
    const clamped = Math.min(ZOOM.max, Math.max(ZOOM.min, next));
    log.debug('handleChangeZoom', 'zoom changed', { zoom: clamped });
    setZoom(clamped);
  }, []);

  return (
    <main className="flex h-full" role="main" aria-label="Sketch lineup creative space">
      <LineupSidebar
        groups={KIND_GROUPS}
        entriesByKind={entriesByKind}
        checkedRefs={checkedRefs}
        expandedGroups={expandedGroups}
        onToggleEntry={handleToggleEntry}
        onToggleAll={handleToggleAll}
        onToggleGroup={handleToggleGroup}
      />
      <LineupContentArea entries={selectedEntries} zoom={zoom} onChangeZoom={handleChangeZoom} />
    </main>
  );
}

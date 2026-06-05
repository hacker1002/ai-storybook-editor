// resolve-book-sequence.test.ts — walker parity + guardrail tests.
import { describe, it, expect } from 'vitest';
import { resolveBookSequence } from './resolve-book-sequence';
import { MAX_BOOK_SPREADS } from '@/remotion/composition-metadata';
import type { PlayableSpread } from '@/types/playable-types';
import type { Section, BranchSetting } from '@/types/illustration-types';

// Minimal spread factory — walker only reads id / branch_setting (+ array order).
function makeSpread(id: string, branch_setting?: BranchSetting): PlayableSpread {
  return { id, animations: [], branch_setting } as unknown as PlayableSpread;
}

function makeSection(
  id: string,
  start_spread_id: string,
  end_spread_id: string,
  next_spread_id?: string | null,
): Section {
  return { id, start_spread_id, end_spread_id, next_spread_id } as unknown as Section;
}

const EDITION = { edition: 'classic' as const };

describe('resolveBookSequence', () => {
  it('linear book → ordered in array order, last has turnToNext=null', () => {
    const spreads = [makeSpread('a'), makeSpread('b'), makeSpread('c')];
    const seq = resolveBookSequence(spreads, undefined, EDITION);

    expect(seq.ordered.map((o) => o.spreadId)).toEqual(['a', 'b', 'c']);
    expect(seq.ordered.map((o) => o.turnToNext)).toEqual(['next', 'next', null]);
    expect(seq.truncatedByCycle).toBe(false);
    expect(seq.truncatedByCap).toBe(false);
  });

  it('section.next_spread_id overrides array order at end_spread_id', () => {
    // array order would go a→b→c→d, but section jumps a..b then to d (skip c).
    const spreads = [makeSpread('a'), makeSpread('b'), makeSpread('c'), makeSpread('d')];
    const sections = [makeSection('s1', 'a', 'b', 'd')];
    const seq = resolveBookSequence(spreads, sections, EDITION);

    expect(seq.ordered.map((o) => o.spreadId)).toEqual(['a', 'b', 'd']);
  });

  it('branch → follows default branch start_spread_id', () => {
    const branch: BranchSetting = {
      branches: [
        { section_id: 'sx', is_default: false } as never,
        { section_id: 'sy', is_default: true } as never,
      ],
    } as unknown as BranchSetting;
    const spreads = [makeSpread('a', branch), makeSpread('x'), makeSpread('y')];
    const sections = [
      makeSection('sx', 'x', 'x', null),
      makeSection('sy', 'y', 'y', null),
    ];
    const seq = resolveBookSequence(spreads, sections, { ...EDITION, startSpreadId: 'a' });

    // 'a' branches to default section sy → start 'y'.
    expect(seq.ordered.map((o) => o.spreadId)).toEqual(['a', 'y']);
  });

  it('default start is spreads[0] (branch-picker) — NOT sections[0].start_spread_id', () => {
    // Real-book shape: spreads[0] is a branch-picker that PRECEDES the first
    // section. Player auto-mode starts at spreads[0] (localSelectedSpreadId init),
    // so the walker must too — else the branch-choice spread is silently dropped
    // and no branch is followed. Regression guard for the default-start divergence.
    const branch: BranchSetting = {
      branches: [
        { section_id: 'sy', is_default: true } as never,
        { section_id: 'sx', is_default: false } as never,
      ],
    } as unknown as BranchSetting;
    const spreads = [makeSpread('pick', branch), makeSpread('x'), makeSpread('y')];
    const sections = [
      makeSection('sx', 'x', 'x', null), // sections[0].start = 'x' (the WRONG default)
      makeSection('sy', 'y', 'y', null),
    ];
    // No startSpreadId → must default to spreads[0] = 'pick', then default branch sy → 'y'.
    const seq = resolveBookSequence(spreads, sections, EDITION);

    expect(seq.ordered.map((o) => o.spreadId)).toEqual(['pick', 'y']);
  });

  it('branch with no is_default → falls back to branches[0]', () => {
    const branch: BranchSetting = {
      branches: [{ section_id: 'sx', is_default: false } as never],
    } as unknown as BranchSetting;
    const spreads = [makeSpread('a', branch), makeSpread('x')];
    const sections = [makeSection('sx', 'x', 'x', null)];
    const seq = resolveBookSequence(spreads, sections, { ...EDITION, startSpreadId: 'a' });

    expect(seq.ordered.map((o) => o.spreadId)).toEqual(['a', 'x']);
  });

  it('cycle → truncatedByCycle=true, stops before revisiting', () => {
    // a→b→a loop via section back-jump.
    const spreads = [makeSpread('a'), makeSpread('b')];
    const sections = [
      makeSection('s1', 'a', 'a', 'b'),
      makeSection('s2', 'b', 'b', 'a'),
    ];
    const seq = resolveBookSequence(spreads, sections, EDITION);

    expect(seq.ordered.map((o) => o.spreadId)).toEqual(['a', 'b']);
    expect(seq.truncatedByCycle).toBe(true);
    expect(seq.truncatedByCap).toBe(false);
  });

  it('> MAX_BOOK_SPREADS → truncatedByCap=true', () => {
    // Build MAX+10 linear spreads; cap should trip at MAX.
    const n = MAX_BOOK_SPREADS + 10;
    const spreads = Array.from({ length: n }, (_, i) => makeSpread(`s${i}`));
    const seq = resolveBookSequence(spreads, undefined, EDITION);

    expect(seq.ordered.length).toBe(MAX_BOOK_SPREADS);
    expect(seq.truncatedByCap).toBe(true);
    expect(seq.truncatedByCycle).toBe(false);
  });

  it('startSpreadId overrides default start', () => {
    const spreads = [makeSpread('a'), makeSpread('b'), makeSpread('c')];
    const seq = resolveBookSequence(spreads, undefined, { ...EDITION, startSpreadId: 'b' });

    expect(seq.ordered.map((o) => o.spreadId)).toEqual(['b', 'c']);
  });

  it('empty spreads → empty ordered, no truncation', () => {
    const seq = resolveBookSequence([], undefined, EDITION);
    expect(seq.ordered).toEqual([]);
    expect(seq.truncatedByCycle).toBe(false);
    expect(seq.truncatedByCap).toBe(false);
  });

  // H1 invariant: end_spread_id is 1:1 per section (non-overlapping contiguous groups).
  // Walker stateless find() == player stateful gate when invariant holds.
  it('section-jump invariant: single section owner of end_spread_id matches player', () => {
    // Two disjoint sections: s1 owns spread 'a'+'b', s2 owns 'c'+'d'.
    // s1.next_spread_id = 'd' (jump over 'c' on exit from s1).
    // s2.next_spread_id = null (end of story).
    const spreads = [makeSpread('a'), makeSpread('b'), makeSpread('c'), makeSpread('d')];
    const sections = [
      makeSection('s1', 'a', 'b', 'd'),  // s1: a..b → jump to d
      makeSection('s2', 'c', 'd', null),  // s2: c..d → end (next=null)
    ];
    const seq = resolveBookSequence(spreads, sections, EDITION);
    // a→b (section jump to d, skip c) → d (s2.end, next=null → stop)
    expect(seq.ordered.map((o) => o.spreadId)).toEqual(['a', 'b', 'd']);
    expect(seq.truncatedByCycle).toBe(false);
    expect(seq.truncatedByCap).toBe(false);
  });
});

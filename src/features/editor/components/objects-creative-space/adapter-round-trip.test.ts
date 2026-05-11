// adapter-round-trip.test.ts — Validate adapter idempotence (ADR-028 Validation S1)
// Tests: adaptToAnimationSelectedItem ↔ adaptFromAnimationItem contract

import { describe, it, expect } from 'vitest';
import {
  adaptToAnimationSelectedItem,
  adaptFromAnimationItem,
  type SelectedItem,
  type ObjectElementType,
} from './objects-creative-space-adapters';
import type { ItemType } from '@/types/animation-types';

describe('Adapter round-trip (ADR-028 Validation S1)', () => {
  /**
   * Animation-compatible types per phase-04 constraint.
   * These types can be animation targets and must round-trip losslessly.
   */
  const ANIMATION_COMPATIBLE_TYPES: ItemType[] = [
    'image',
    'textbox',
    'shape',
    'video',
    'auto_pic',
    'audio',
    'auto_audio',
    'composite',
  ];

  describe('round-trip: object → animation → object', () => {
    it.each(ANIMATION_COMPATIBLE_TYPES)(
      '%s: adaptToAnimationSelectedItem(adaptFromAnimationItem(type, id)) preserves type and id',
      (itemType: ItemType) => {
        const itemId = `${itemType}-1`;
        const selectedItem: SelectedItem = { type: itemType as ObjectElementType, id: itemId };

        // object → animation
        const animationItem = adaptToAnimationSelectedItem(selectedItem);

        // Verify intermediate result
        expect(animationItem).not.toBeNull();
        expect(animationItem?.type).toBe(itemType);
        expect(animationItem?.id).toBe(itemId);

        // animation → object
        const roundTrip = adaptFromAnimationItem(animationItem?.type ?? null, animationItem?.id ?? null);

        // Verify no data loss
        expect(roundTrip).not.toBeNull();
        expect(roundTrip?.type).toBe(selectedItem.type);
        expect(roundTrip?.id).toBe(selectedItem.id);
      },
    );

    it('raw_image maps to image (lossy by design)', () => {
      const selectedItem: SelectedItem = { type: 'raw_image', id: 'raw-img-1' };

      // object → animation
      const animationItem = adaptToAnimationSelectedItem(selectedItem);

      // Verify lossy mapping: raw_image → image
      expect(animationItem).not.toBeNull();
      expect(animationItem?.type).toBe('image');
      expect(animationItem?.id).toBe('raw-img-1');

      // animation → object (no data to reverse lossy mapping)
      const roundTrip = adaptFromAnimationItem(animationItem?.type ?? null, animationItem?.id ?? null);

      // Result is {type: 'image', id: 'raw-img-1'}, NOT {type: 'raw_image', ...}
      expect(roundTrip?.type).toBe('image');
      expect(roundTrip?.type).not.toBe('raw_image'); // Lossy by design
    });

    it('raw_textbox maps to textbox (lossy by design)', () => {
      const selectedItem: SelectedItem = { type: 'raw_textbox', id: 'raw-txt-1' };

      // object → animation
      const animationItem = adaptToAnimationSelectedItem(selectedItem);

      // Verify lossy mapping: raw_textbox → textbox
      expect(animationItem).not.toBeNull();
      expect(animationItem?.type).toBe('textbox');
      expect(animationItem?.id).toBe('raw-txt-1');

      // animation → object (no reverse mapping)
      const roundTrip = adaptFromAnimationItem(animationItem?.type ?? null, animationItem?.id ?? null);

      // Result is {type: 'textbox', id: 'raw-txt-1'}, NOT {type: 'raw_textbox', ...}
      expect(roundTrip?.type).toBe('textbox');
      expect(roundTrip?.type).not.toBe('raw_textbox'); // Lossy by design
    });
  });

  describe('null/undefined edge cases', () => {
    it('adaptToAnimationSelectedItem(null) returns null', () => {
      expect(adaptToAnimationSelectedItem(null)).toBeNull();
    });

    it('adaptFromAnimationItem(null, id) returns null', () => {
      expect(adaptFromAnimationItem(null, 'any-id')).toBeNull();
    });

    it('adaptFromAnimationItem(type, null) returns null', () => {
      expect(adaptFromAnimationItem('image', null)).toBeNull();
    });

    it('adaptFromAnimationItem(null, null) returns null', () => {
      expect(adaptFromAnimationItem(null, null)).toBeNull();
    });

    it('adaptToAnimationSelectedItem(null) prevents downstream null access', () => {
      const result = adaptToAnimationSelectedItem(null);
      expect(() => {
        adaptFromAnimationItem(result?.type ?? null, result?.id ?? null);
      }).not.toThrow();
    });
  });

  describe('non-compatible types (objects space-only)', () => {
    it('quiz type returns null (not animation-compatible)', () => {
      const selectedItem: SelectedItem = { type: 'quiz' as ObjectElementType, id: 'quiz-1' };
      expect(adaptToAnimationSelectedItem(selectedItem)).toBeNull();
    });

    it('unrecognized type returns null', () => {
      const selectedItem = { type: 'unknown' as ObjectElementType, id: 'unknown-1' };
      expect(adaptToAnimationSelectedItem(selectedItem)).toBeNull();
    });
  });

  describe('round-trip contract validation', () => {
    it('contract: for all animation-compatible types, round-trip is lossless', () => {
      const testCases = ANIMATION_COMPATIBLE_TYPES.map((type) => ({
        type,
        id: `test-${type}-123`,
      }));

      for (const { type, id } of testCases) {
        const obj: SelectedItem = { type: type as ObjectElementType, id };
        const anim = adaptToAnimationSelectedItem(obj);
        const roundTrip = adaptFromAnimationItem(anim?.type ?? null, anim?.id ?? null);

        expect(roundTrip).toEqual(obj);
      }
    });

    it('contract: no data loss for animation-compatible types through full cycle', () => {
      const originalIds = new Map<ItemType, string[]>([
        ['image', ['img-1', 'img-2', 'img-3']],
        ['textbox', ['txt-1', 'txt-2']],
        ['shape', ['shape-1']],
        ['video', ['vid-1', 'vid-2']],
        ['auto_pic', ['apic-1']],
        ['audio', ['aud-1']],
        ['auto_audio', ['aaudio-1']],
        ['composite', ['comp-1', 'comp-2']],
      ]);

      for (const [type, ids] of originalIds) {
        for (const id of ids) {
          const original: SelectedItem = { type: type as ObjectElementType, id };
          const anim = adaptToAnimationSelectedItem(original);
          const result = adaptFromAnimationItem(anim?.type ?? null, anim?.id ?? null);

          expect(result).toEqual(original);
        }
      }
    });
  });
});

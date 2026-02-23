// __mocks__/snapshot-factory.ts - Mock data factory for Snapshot objects

import { createMockSpreads, type CreateSpreadOptions } from './spread-factory';
import type { BaseSpread } from '../types';

// === Helper: Generate UUID ===
function generateUUID(): string {
  return crypto.randomUUID();
}

// === Character Data ===
interface MockCharacter {
  order: number;
  key: string;
  name: string;
  basic_info: {
    description: string;
    gender: string;
    age: string;
    role: string;
  };
  variants: Array<{
    name: string;
    key: string;
    type: number;
    visual_description: string;
  }>;
}

// === Prop Data ===
interface MockProp {
  order: number;
  key: string;
  name: string;
  type: 'narrative' | 'anchor';
  states: Array<{
    name: string;
    key: string;
    type: number;
    visual_description: string;
  }>;
}

// === Stage Data ===
interface MockStage {
  order: number;
  key: string;
  name: string;
  settings: Array<{
    name: string;
    key: string;
    type: number;
    visual_description: string;
    temporal: {
      era: string;
      season: string;
      weather: string;
      time_of_day: string;
    };
  }>;
}

// === Snapshot Interface ===
interface MockSnapshot {
  id: string;
  version: string;
  tag: string;
  book_id: string;
  save_type: number;
  docs: Array<{ type: string; title: string; content: string }>;
  dummies: unknown[];
  sketch: null;
  spreads: BaseSpread[];
  characters: MockCharacter[];
  props: MockProp[];
  stages: MockStage[];
}

// === Sample Characters ===
const SAMPLE_CHARACTERS: MockCharacter[] = [
  {
    order: 1,
    key: 'miu_cat',
    name: 'Miu',
    basic_info: {
      description: 'A curious orange tabby kitten with bright green eyes.',
      gender: 'male',
      age: '1 year old',
      role: 'main character',
    },
    variants: [
      {
        name: 'Default',
        key: 'default',
        type: 0,
        visual_description:
          'Small orange tabby cat with fluffy fur, green eyes, and a pink nose.',
      },
      {
        name: 'Adventurer',
        key: 'adventurer',
        type: 1,
        visual_description:
          'Miu wearing a tiny red bandana and carrying a small satchel.',
      },
    ],
  },
  {
    order: 2,
    key: 'butterfly_friend',
    name: 'Flutter',
    basic_info: {
      description: 'A friendly butterfly with colorful wings.',
      gender: 'female',
      age: 'young',
      role: 'supporting character',
    },
    variants: [
      {
        name: 'Default',
        key: 'default',
        type: 0,
        visual_description:
          'A delicate butterfly with blue and orange wings, golden antennae.',
      },
    ],
  },
];

// === Sample Props ===
const SAMPLE_PROPS: MockProp[] = [
  {
    order: 1,
    key: 'red_bandana',
    name: 'Red Bandana',
    type: 'narrative',
    states: [
      {
        name: 'Default',
        key: 'default',
        type: 0,
        visual_description: 'A bright red cotton bandana with white polka dots.',
      },
    ],
  },
  {
    order: 2,
    key: 'magic_acorn',
    name: 'Magic Acorn',
    type: 'narrative',
    states: [
      {
        name: 'Default',
        key: 'default',
        type: 0,
        visual_description: 'A golden acorn with a faint magical glow.',
      },
      {
        name: 'Glowing',
        key: 'glowing',
        type: 1,
        visual_description: 'The acorn glowing brightly with golden sparkles.',
      },
    ],
  },
];

// === Sample Stages ===
const SAMPLE_STAGES: MockStage[] = [
  {
    order: 1,
    key: 'cottage_garden',
    name: 'Cottage Garden',
    settings: [
      {
        name: 'Morning',
        key: 'morning',
        type: 0,
        visual_description:
          'A colorful cottage garden with flowers, vegetables, and a stone path.',
        temporal: {
          era: 'modern',
          season: 'spring',
          weather: 'sunny',
          time_of_day: 'morning',
        },
      },
      {
        name: 'Evening',
        key: 'evening',
        type: 1,
        visual_description:
          'The garden bathed in golden sunset light, fireflies beginning to appear.',
        temporal: {
          era: 'modern',
          season: 'spring',
          weather: 'clear',
          time_of_day: 'evening',
        },
      },
    ],
  },
  {
    order: 2,
    key: 'forest_clearing',
    name: 'Forest Clearing',
    settings: [
      {
        name: 'Default',
        key: 'default',
        type: 0,
        visual_description:
          'A peaceful clearing surrounded by tall oak trees, sunlight filtering through.',
        temporal: {
          era: 'modern',
          season: 'summer',
          weather: 'partly cloudy',
          time_of_day: 'afternoon',
        },
      },
    ],
  },
];

// === Create Mock Snapshot ===
export interface CreateSnapshotOptions extends Omit<CreateSpreadOptions, 'spreadIndex'> {
  spreadCount?: number;
  includeCharacters?: boolean;
  includeProps?: boolean;
  includeStages?: boolean;
}

export function createMockSnapshot(options: CreateSnapshotOptions = {}): MockSnapshot {
  const {
    spreadCount = 6,
    includeCharacters = true,
    includeProps = true,
    includeStages = true,
    ...spreadOptions
  } = options;

  const now = new Date();
  const version = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes()
  ).padStart(2, '0')}`;

  return {
    id: generateUUID(),
    version,
    tag: 'draft',
    book_id: generateUUID(),
    save_type: 1, // manual save
    docs: [
      {
        type: 'brief',
        title: 'Story Brief',
        content: "A curious kitten named Miu discovers the magic of friendship during a garden adventure.",
      },
      {
        type: 'draft',
        title: 'Story Draft',
        content: 'Miu wakes up one sunny morning and decides to explore beyond the garden fence...',
      },
    ],
    dummies: [],
    sketch: null,
    spreads: createMockSpreads(spreadCount, spreadOptions),
    characters: includeCharacters ? SAMPLE_CHARACTERS : [],
    props: includeProps ? SAMPLE_PROPS : [],
    stages: includeStages ? SAMPLE_STAGES : [],
  };
}

export default {
  createMockSnapshot,
  SAMPLE_CHARACTERS,
  SAMPLE_PROPS,
  SAMPLE_STAGES,
};

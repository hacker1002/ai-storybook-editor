// human.ts — Type definitions for Humans feature (list + detail + visual/voice profiles).

export type HumanGender = 0 | 1 | null; // 0=female, 1=male, null=unspecified

export interface VisualProfile {
  /** FE-only React key (uuid). Stripped before DB write by `toVisualProfileRow`. */
  clientId: string;
  name: string;
  age: number;
  type: 'face' | 'full_body' | string;
  rawImages: string[];
  faceModel: Record<string, unknown> | null;
}

export interface VoiceProfile {
  /** FE-only React key (uuid). Stripped before DB write by `toVoiceProfileRow`. */
  clientId: string;
  name: string;
  age: number;
  recordUrl: string;
}

export interface Human {
  id: string;
  sourceName: string;
  displayName: Record<string, string>;
  gender: HumanGender;
  country: string | null;
  description: string | null;
  visualProfiles: VisualProfile[];
  voiceProfiles: VoiceProfile[];
  createdAt: string;
}

export interface HumanMetadataPatch {
  sourceName?: string;
  displayName?: Record<string, string>;
  gender?: HumanGender;
  country?: string | null;
  description?: string | null;
}

export interface VisualProfileRow {
  name?: string;
  age: number;
  type: string;
  raw_images: string[];
  face_model: Record<string, unknown> | null;
}

export interface VoiceProfileRow {
  name?: string;
  age: number;
  record_url: string;
}

export interface HumanRow {
  id: string;
  source_name: string;
  display_name: Record<string, string> | null;
  gender: number | null;
  country: string | null;
  description: string | null;
  visual_profiles: VisualProfileRow[] | null;
  voice_profiles: VoiceProfileRow[] | null;
  created_at: string;
}

export interface HumansFilterState {
  search: string;
}

export type HumansActiveModal = 'create' | null;

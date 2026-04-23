import type { Voice, VoiceAge, VoiceGender, VoiceRow, VoiceType } from '@/types/voice';

export function mapVoiceRow(row: VoiceRow): Voice {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender as VoiceGender,
    age: row.age as VoiceAge,
    language: row.language,
    accent: row.accent,
    description: row.description,
    model: row.model,
    elevenId: row.eleven_id,
    tags: row.tags,
    type: row.type as VoiceType,
    previewAudioUrl: row.preview_audio_url,
    sampleAudioUrl: row.sample_audio_url,
    loudness: row.loudness,
    guidance: row.guidance,
  };
}

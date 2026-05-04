import type { Sound, SoundRow, SoundSource } from '@/types/sound';

export function mapSoundRow(row: SoundRow): Sound {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    mediaUrl: row.media_url,
    loop: row.loop,
    duration: row.duration,
    influence: row.influence,
    tags: row.tags,
    source: (row.source === 1 ? 1 : 0) as SoundSource,
    createdAt: row.created_at,
  };
}

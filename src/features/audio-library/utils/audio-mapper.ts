import type { AudioResource, AudioRow, AudioSource } from '../types';

export function mapAudioRow(row: AudioRow): AudioResource {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    mediaUrl: row.media_url,
    loop: row.loop,
    duration: row.duration,
    influence: row.influence,
    tags: row.tags,
    source: (row.source === 1 ? 1 : 0) as AudioSource,
    createdAt: row.created_at,
  };
}

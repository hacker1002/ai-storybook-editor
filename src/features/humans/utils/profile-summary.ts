// profile-summary.ts — Format profile count summary for delete dialog description.

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

export function formatProfileSummary(visualCount: number, voiceCount: number): string {
  const parts: string[] = [];
  if (visualCount > 0) parts.push(pluralize(visualCount, 'visual profile'));
  if (voiceCount > 0) parts.push(pluralize(voiceCount, 'voice profile'));
  if (parts.length === 0) return 'no profiles';
  if (parts.length === 1) return parts[0];
  return parts.join(' and ');
}

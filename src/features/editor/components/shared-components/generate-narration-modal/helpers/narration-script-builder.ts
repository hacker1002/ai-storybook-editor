// narration-script-builder.ts — Build single-turn narrate-script payload text.
// Per spec: ai-storybook-design/api/text-generation/02-narrate-script.md
// Format: `@${elevenId}: ${scriptText}` (single voice tag per call; multi-turn rejected).

const ELEVEN_ID_REGEX = /^[A-Za-z0-9_-]{10,40}$/;

export class InvalidElevenIdError extends Error {
  constructor(elevenId: string) {
    super(
      `ElevenLabs voiceId không hợp lệ: "${elevenId}" (yêu cầu 10–40 ký tự A-Z/0-9/_/-).`,
    );
    this.name = 'InvalidElevenIdError';
  }
}

/**
 * Build the single-turn `script` payload field for `narrate-script`.
 *
 * @param elevenId  ElevenLabs voice ID (e.g. `21m00Tcm4TlvDq8ikWAM`).
 * @param text      Raw textbox script (plain text — no `@key:` prefix).
 * @throws InvalidElevenIdError if `elevenId` fails regex validation.
 */
export function buildNarrateScriptText(
  elevenId: string,
  text: string,
): string {
  if (!ELEVEN_ID_REGEX.test(elevenId)) {
    throw new InvalidElevenIdError(elevenId);
  }
  return `@${elevenId}: ${text}`;
}

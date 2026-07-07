// generate-password.ts — Generates a strong temporary password for the Create
// User modal. Uses crypto.getRandomValues (unbiased rejection sampling) and
// guarantees at least one lower/upper/digit/symbol so it clears common policies.

const LOWER = 'abcdefghijkmnpqrstuvwxyz'; // no l/o (visual ambiguity)
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O
const DIGITS = '23456789'; // no 0/1
const SYMBOLS = '!@#$%^&*?-_';
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/** Cryptographically-strong index in [0, max) without modulo bias. */
function randomIndex(max: number): number {
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let v = 0;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= limit);
  return v % max;
}

function pick(charset: string): string {
  return charset[randomIndex(charset.length)];
}

/** Fisher–Yates shuffle using the same unbiased RNG. */
function shuffle(chars: string[]): string[] {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
}

/** Generate a strong password (default length 16, minimum enforced at 8). */
export function generatePassword(length = 16): string {
  const size = Math.max(8, length);
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  const rest: string[] = [];
  for (let i = required.length; i < size; i++) {
    rest.push(pick(ALL));
  }
  return shuffle([...required, ...rest]).join('');
}

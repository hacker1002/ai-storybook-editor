// is-valid-email.ts — Lightweight client-side email check (shared by the Create
// and Edit modals). The admin API is authoritative; this just saves a round-trip
// and gives a clearer inline message than a server 400.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

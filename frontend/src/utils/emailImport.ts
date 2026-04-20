/**
 * Client-side hint for import UX. Authoritative validation runs on the server (Zod email).
 * Keep paste/file flows permissive so the API can return `skippedInvalid` counts.
 */
const EMAIL_HINT =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function looksLikeEmail(value: string): boolean {
  const s = value.trim().toLowerCase();
  return s.length > 3 && s.length <= 320 && EMAIL_HINT.test(s);
}

import { z } from 'zod';

const emailSchema = z.string().email();

/** Max length aligned with practical mailbox limits. */
const MAX_EMAIL_LEN = 320;

/**
 * Validates a single address for list import (stricter than loose regex; aligns with Zod email).
 */
export function isValidImportEmail(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s || s.length > MAX_EMAIL_LEN) return false;
  return emailSchema.safeParse(s).success;
}

export function normalizeImportEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export type ImportEmailParseResult = {
  validEmails: string[];
  skippedInvalid: number;
  /** Up to 5 examples of rejected input (truncated). */
  invalidSamples: string[];
};

const MAX_SAMPLES = 5;

/**
 * Dedupes, normalizes, and filters to RFC/Zod-acceptable emails for list import.
 */
export function parseImportEmailCandidates(candidates: string[]): ImportEmailParseResult {
  const seen = new Set<string>();
  const validEmails: string[] = [];
  let skippedInvalid = 0;
  const invalidSamples: string[] = [];

  for (const raw of candidates) {
    const normalized = normalizeImportEmail(raw);
    if (!normalized) continue;

    if (!isValidImportEmail(normalized)) {
      skippedInvalid += 1;
      if (invalidSamples.length < MAX_SAMPLES) {
        invalidSamples.push(raw.length > 80 ? `${raw.slice(0, 77)}…` : raw);
      }
      continue;
    }

    if (seen.has(normalized)) continue;
    seen.add(normalized);
    validEmails.push(normalized);
  }

  return { validEmails, skippedInvalid, invalidSamples };
}

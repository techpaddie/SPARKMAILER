import crypto from 'crypto';
import { env } from '../config';

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecodeToString(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

function hmacSha256Base64Url(payloadB64: string, secret: string): string {
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest();
  return base64UrlEncode(sig);
}

function safeHeaderValue(v: string): string {
  // Prevent header injection: strip CR/LF and NULL.
  return v.replace(/[\r\n\0]+/g, ' ').trim();
}

function emailDomain(addr: string): string {
  const at = addr.lastIndexOf('@');
  return at >= 0 ? addr.slice(at + 1).trim().toLowerCase() : 'localhost';
}

export type UnsubscribeTokenPayload = {
  u: string; // userId
  e?: string; // recipient email (optional; prefer recipientId to avoid exposing email in URL)
  c?: string; // campaignId
  r?: string; // recipientId
  i: number; // issuedAt (unix seconds)
};

export function buildPublicBaseUrl(): string {
  const fromEnv = env.PUBLIC_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/g, '');

  return `http://localhost:${env.PORT}`;
}

export function buildUnsubscribeUrl(payload: Omit<UnsubscribeTokenPayload, 'i'>): string {
  if (!payload.u || (!payload.e && !payload.r)) {
    throw new Error('Unsubscribe token payload must include userId and either email or recipientId');
  }
  const full: UnsubscribeTokenPayload = { ...payload, i: Math.floor(Date.now() / 1000) };
  const payloadB64 = base64UrlEncode(JSON.stringify(full));
  const sig = hmacSha256Base64Url(payloadB64, env.JWT_SECRET);
  const base = buildPublicBaseUrl();
  return `${base}/unsubscribe?d=${encodeURIComponent(payloadB64)}&s=${encodeURIComponent(sig)}`;
}

export function verifyUnsubscribeToken(d: string, s: string): UnsubscribeTokenPayload | null {
  try {
    const expected = hmacSha256Base64Url(d, env.JWT_SECRET);
    const a = Buffer.from(expected);
    const b = Buffer.from(s);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const json = base64UrlDecodeToString(d);
    const parsed = JSON.parse(json) as UnsubscribeTokenPayload;
    if (!parsed?.u || !parsed?.i) return null;
    if (!parsed.e && !parsed.r) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type ProtectiveHeadersInput = {
  userId: string;
  campaignId?: string;
  recipientId?: string;
  recipientEmail: string;
  fromEmail: string;
  fromName?: string | null;
  replyTo?: string | null;
};

export type ProtectiveHeadersOutput = {
  from: string;
  replyTo: string;
  messageId: string;
  headers: Record<string, string>;
  unsubscribeUrl: string;
};

export function buildProtectiveHeaders(input: ProtectiveHeadersInput): ProtectiveHeadersOutput {
  const fromDomain = emailDomain(input.fromEmail);
  const messageId = `<${crypto.randomUUID()}@${fromDomain}>`;
  const replyTo = safeHeaderValue((input.replyTo || input.fromEmail).trim());

  const unsubscribeUrl = buildUnsubscribeUrl({
    u: input.userId,
    e: input.recipientId ? undefined : input.recipientEmail,
    c: input.campaignId,
    r: input.recipientId,
  });

  const listId = input.campaignId
    ? `campaign-${input.campaignId.slice(0, 8)}.${fromDomain}`
    : `sparkmailer.${fromDomain}`;

  const feedbackId = [
    input.campaignId ? `c:${input.campaignId}` : null,
    input.recipientId ? `r:${input.recipientId}` : null,
    `u:${input.userId}`,
  ]
    .filter(Boolean)
    .join(':');

  const headers: Record<string, string> = {
    'Message-ID': messageId,
    Date: new Date().toUTCString(),
    'MIME-Version': '1.0',
    'X-Auto-Response-Suppress': 'All',
    Precedence: 'bulk',
    'List-ID': safeHeaderValue(`<${listId}>`),
    'Feedback-ID': safeHeaderValue(feedbackId),
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };

  const from = input.fromName
    ? `"${safeHeaderValue(input.fromName)}" <${safeHeaderValue(input.fromEmail)}>`
    : safeHeaderValue(input.fromEmail);

  return {
    from,
    replyTo,
    messageId,
    headers,
    unsubscribeUrl,
  };
}


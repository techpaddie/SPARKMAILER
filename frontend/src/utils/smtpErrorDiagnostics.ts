/**
 * Classifies SMTP / Nodemailer failures for UI (test stream, campaign recipient errors, etc.).
 * Uses responseCode when present, else parses common patterns from message/response text.
 */

export type SmtpErrorCategory =
  | 'authentication'
  | 'tls'
  | 'connection'
  | 'rate_limit'
  | 'policy_recipient'
  | 'policy_content'
  | 'server_error'
  | 'unknown';

export type SmtpErrorMeta = {
  message: string;
  responseCode?: number | null;
  code?: string | null;
  response?: string | null;
  command?: string | null;
};

export type SmtpErrorDiagnostics = {
  category: SmtpErrorCategory;
  /** SMTP reply code when known (e.g. 535). */
  smtpResponseCode: number | null;
  /** Nodemailer / Node errno-style code when known (e.g. EAUTH, ETIMEDOUT). */
  nodemailerCode: string | null;
  /** Short label for badges. */
  label: string;
  summary: string;
  hints: string[];
};

const CATEGORY_LABELS: Record<SmtpErrorCategory, string> = {
  authentication: 'Authentication',
  tls: 'TLS / certificate',
  connection: 'Connection',
  rate_limit: 'Rate limit / temporary',
  policy_recipient: 'Recipient policy',
  policy_content: 'Message policy',
  server_error: 'Server error',
  unknown: 'SMTP error',
};

function firstSmtpCodeFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/\b([45]\d{2})\b/);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isNaN(n) ? null : n;
}

function mergeMeta(meta: SmtpErrorMeta): SmtpErrorMeta {
  const responseCode =
    meta.responseCode ??
    firstSmtpCodeFromText(meta.response) ??
    firstSmtpCodeFromText(meta.message) ??
    null;
  return {
    message: meta.message,
    responseCode,
    code: meta.code ?? null,
    response: meta.response ?? null,
    command: meta.command ?? null,
  };
}

function isTlsIssue(code: string | null, msg: string, smtpCode: number | null): boolean {
  const c = (code || '').toUpperCase();
  if (
    c === 'ETLS' ||
    c === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    c === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    c === 'CERT_HAS_EXPIRED' ||
    c === 'SELF_SIGNED_CERT_IN_CHAIN'
  ) {
    return true;
  }
  const lower = msg.toLowerCase();
  if (lower.includes('certificate') || lower.includes('ssl') || lower.includes('tls')) {
    if (lower.includes('wrong version') || lower.includes('handshake')) return true;
  }
  if (smtpCode === 454) return true;
  return false;
}

function isConnectionIssue(code: string | null, msg: string): boolean {
  const c = (code || '').toUpperCase();
  return (
    c === 'ECONNECTION' ||
    c === 'ECONNRESET' ||
    c === 'ETIMEDOUT' ||
    c === 'ENOTFOUND' ||
    c === 'EAI_AGAIN' ||
    c === 'EPIPE' ||
    c === 'ESOCKETTIMEDOUT' ||
    /getaddrinfo|ENOTFOUND|ECONNREFUSED|connection timed out|socket hang up/i.test(msg)
  );
}

/**
 * Build user-facing diagnostics from Nodemailer error fields and/or a plain stored message.
 */
export function classifySmtpError(meta: SmtpErrorMeta): SmtpErrorDiagnostics {
  const m = mergeMeta(meta);
  const msg = m.message;
  const lower = msg.toLowerCase();
  const respLower = (m.response || '').toLowerCase();
  const code = m.code ? m.code.toUpperCase() : null;
  const smtpCode: number | null = m.responseCode ?? null;

  const hints: string[] = [];
  let category: SmtpErrorCategory = 'unknown';
  let summary = msg;

  if (code === 'EAUTH' || smtpCode === 535 || smtpCode === 534 || smtpCode === 538) {
    category = 'authentication';
    summary = 'The server rejected your username or password (or the account is not allowed to send).';
    hints.push('Confirm the SMTP password: many providers require an app-specific password, not your web login.');
    hints.push('Check that the username is the full email address if your provider expects it.');
    if (smtpCode === 538) hints.push('This host may require a secure connection (try port 465 with SSL, or 587 with STARTTLS).');
  } else if (smtpCode === 454 || isTlsIssue(code, msg, smtpCode)) {
    category = 'tls';
    summary = 'TLS handshake or certificate verification failed.';
    hints.push('Try matching TLS mode to your host: port 465 often uses implicit TLS (`secure: true`); port 587 uses STARTTLS (`secure: false`).');
    hints.push('If you use a custom hostname, ensure its certificate matches that hostname.');
  } else if (isConnectionIssue(code, msg)) {
    category = 'connection';
    summary = 'Could not reach the SMTP host or the connection dropped before a reply.';
    hints.push('Verify host, port, firewall, and that outbound SMTP is allowed from this server.');
  } else if (
    smtpCode === 421 ||
    smtpCode === 450 ||
    smtpCode === 451 ||
    smtpCode === 452 ||
    /421|450|451|452/.test(String(smtpCode)) ||
    /rate limit|too many|throttl|try again|temporar(il)?y unavailable|greylist|resource temporarily unavailable/i.test(
      msg + respLower
    )
  ) {
    category = 'rate_limit';
    summary = 'The server temporarily refused the action (busy, greylisting, or rate limiting).';
    hints.push('Reduce parallel sends or wait before retrying; repeated logins can make this worse.');
  } else if (smtpCode === 550 || smtpCode === 551 || smtpCode === 553 || /mailbox unavailable|user unknown|no such user/i.test(msg + respLower)) {
    category = 'policy_recipient';
    summary = 'The recipient address was rejected by the server policy.';
    hints.push('Confirm the “To” address exists and the sender is allowed to mail it.');
  } else if (smtpCode === 552 || /message too large|size limit/i.test(msg + respLower)) {
    category = 'policy_content';
    summary = 'The message was rejected due to size or content policy.';
  } else if (smtpCode != null && smtpCode >= 500) {
    category = 'server_error';
    summary = 'The SMTP server reported a permanent failure (5xx).';
    hints.push('Check the full server response below; your provider’s docs often map these codes to fixes.');
  } else if (smtpCode != null && smtpCode >= 400) {
    category = 'rate_limit';
    summary = 'The SMTP server returned a temporary error (4xx).';
    hints.push('Often safe to retry after a delay unless it repeats.');
  } else if (
    /5\.7\.\d+/.test(`${msg}${m.response || ''}`) ||
    /authentication failed|invalid login|not accepted/i.test(lower + respLower)
  ) {
    category = 'authentication';
    summary = 'Authentication failed (per server reply text).';
    hints.push('Compare settings with your provider’s SMTP documentation (ports, TLS, and credentials).');
  } else {
    summary = msg.length > 200 ? `${msg.slice(0, 197)}…` : msg;
  }

  const label = CATEGORY_LABELS[category];
  return {
    category,
    smtpResponseCode: smtpCode,
    nodemailerCode: code,
    label,
    summary,
    hints,
  };
}

/** When only a stored DB string is available (e.g. campaign recipient `error`). */
export function classifySmtpErrorFromMessage(message: string): SmtpErrorDiagnostics {
  return classifySmtpError({ message });
}

export function smtpDiagnosticsBadgeParts(d: SmtpErrorDiagnostics): string[] {
  const parts: string[] = [];
  if (d.smtpResponseCode != null) parts.push(`SMTP ${d.smtpResponseCode}`);
  if (d.nodemailerCode) parts.push(d.nodemailerCode);
  return parts;
}

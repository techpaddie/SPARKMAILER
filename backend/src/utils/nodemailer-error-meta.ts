/**
 * Pull SMTP / transport fields Nodemailer sets on thrown errors (for structured client UI).
 */
export type SmtpErrorMetaPayload = {
  message: string;
  responseCode: number | null;
  code: string | null;
  response: string | null;
  command: string | null;
};

export function extractNodemailerSmtpMeta(err: unknown): SmtpErrorMetaPayload {
  if (err == null) {
    return { message: 'Unknown error', responseCode: null, code: null, response: null, command: null };
  }
  if (!(err instanceof Error)) {
    return { message: String(err), responseCode: null, code: null, response: null, command: null };
  }
  const e = err as Error & {
    responseCode?: number;
    response?: string;
    command?: string;
    code?: string;
  };
  const responseCode =
    typeof e.responseCode === 'number' && !Number.isNaN(e.responseCode) ? e.responseCode : null;
  return {
    message: e.message,
    responseCode,
    code: typeof e.code === 'string' ? e.code : null,
    response: typeof e.response === 'string' ? e.response : null,
    command: typeof e.command === 'string' ? e.command : null,
  };
}
